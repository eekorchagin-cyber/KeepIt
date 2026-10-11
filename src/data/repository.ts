import type {
  AccountingMode,
  AppSettings,
  CategoryNode,
  Item,
  ObjectKey,
  Place,
  PlaceType,
  UnitCode,
} from '../types'
import { cloneCategoryTree, normalizeCategoryName } from './categories'
import { db } from './db'
import { newId, nowIso } from './ids'
import {
  codeForPlace,
  formatPlacePathCode,
  looksLikeLegacyShortCode,
  placePathNames,
  recomputePlaceCodes,
} from './placeCodes'
import { defaultObjectAppearance, type ObjectIconId } from './icons'
import { buildDraftItems, buildSeedPlaces, defaultSettings } from './seed'

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    categories:
      Array.isArray(settings.categories) && settings.categories.length > 0
        ? cloneCategoryTree(settings.categories)
        : cloneCategoryTree(),
  }
}

export async function ensureSeeded(): Promise<AppSettings> {
  const existing = await db.settings.get('settings')
  if (existing) {
    await purgeOrphanFamilies(existing.familyId)
    await migrateHomeToApartment()
    await migrateObjectIconsIfNeeded()
    await migratePlaceCodesIfNeeded()
    const normalized = normalizeSettings(existing)
    if (!existing.categories?.length) {
      await db.settings.put(normalized)
    }
    return normalized
  }

  const familyId = newId()
  const settings = defaultSettings(familyId)
  const places = buildSeedPlaces(familyId)
  const dacha = places.find((place) => place.objectKey === 'dacha' && place.type === 'object')
  const items = dacha ? buildDraftItems(familyId, dacha.id) : []

  await db.transaction('rw', db.settings, db.places, db.items, async () => {
    await db.settings.put(settings)
    await db.places.bulkPut(places)
    if (items.length) await db.items.bulkPut(items)
  })

  return settings
}

/** Удаляет дубликаты деревьев от повторного сида (другой familyId). */
async function purgeOrphanFamilies(familyId: string): Promise<void> {
  const [places, items, moves] = await Promise.all([
    db.places.toArray(),
    db.items.toArray(),
    db.moves.toArray(),
  ])
  const orphanPlaces = places.filter((place) => place.familyId !== familyId).map((place) => place.id)
  const orphanItems = items.filter((item) => item.familyId !== familyId).map((item) => item.id)
  const orphanMoves = moves.filter((move) => move.familyId !== familyId).map((move) => move.id)
  if (!orphanPlaces.length && !orphanItems.length && !orphanMoves.length) return

  await db.transaction('rw', db.places, db.items, db.moves, async () => {
    if (orphanPlaces.length) await db.places.bulkDelete(orphanPlaces)
    if (orphanItems.length) await db.items.bulkDelete(orphanItems)
    if (orphanMoves.length) await db.moves.bulkDelete(orphanMoves)
  })
}

/** Переименование главного объекта «Дом» → «Квартира» (не путать с помещением «Дом» на даче). */
async function migrateHomeToApartment(): Promise<void> {
  const places = await db.places.toArray()
  const roots = places.filter(
    (place) => place.type === 'object' && place.objectKey === 'home' && place.name === 'Дом',
  )
  if (roots.length === 0) return
  const renamed = places.map((place) => {
    if (place.type === 'object' && place.objectKey === 'home' && place.name === 'Дом') {
      return {
        ...place,
        name: 'Квартира',
        version: place.version + 1,
        updatedAt: nowIso(),
        syncStatus: 'pending' as const,
      }
    }
    return place
  })
  const updated = recomputePlaceCodes(renamed).map((place) => ({
    ...place,
    updatedAt: nowIso(),
    syncStatus: 'pending' as const,
  }))
  await db.places.bulkPut(updated)
}

async function migratePlaceCodesIfNeeded(): Promise<void> {
  const places = await db.places.toArray()
  if (places.length === 0) return
  const needsMigration = places.some(
    (place) => looksLikeLegacyShortCode(place.code) || place.code !== codeForPlace(place.id, places),
  )
  if (!needsMigration) return
  const updated = recomputePlaceCodes(places).map((place) => ({
    ...place,
    updatedAt: nowIso(),
    syncStatus: 'pending' as const,
  }))
  await db.places.bulkPut(updated)
}

async function migrateObjectIconsIfNeeded(): Promise<void> {
  const places = await db.places.toArray()
  const missing = places.filter(
    (place) =>
      place.type === 'object' &&
      (!place.iconId || !place.iconBg || place.iconId === undefined || place.iconBg === undefined),
  )
  if (missing.length === 0) {
    // Дозаполнить пустые поля у вложенных мест
    const nested = places.filter((place) => place.type !== 'object' && (place.iconId == null || place.iconBg == null))
    if (nested.length === 0) return
    await db.places.bulkPut(
      nested.map((place) => ({
        ...place,
        iconId: place.iconId ?? '',
        iconBg: place.iconBg ?? '',
      })),
    )
    return
  }
  const updates = missing.map((place) => {
    const look = defaultObjectAppearance(place.objectKey)
    return {
      ...place,
      iconId: place.iconId || look.iconId,
      iconBg: place.iconBg || look.iconBg,
      updatedAt: nowIso(),
      syncStatus: 'pending' as const,
    }
  })
  await db.places.bulkPut(updates)
}

function normalizePlace(place: Place): Place {
  if (place.type === 'object') {
    const look = defaultObjectAppearance(place.objectKey)
    return {
      ...place,
      iconId: place.iconId || look.iconId,
      iconBg: place.iconBg || look.iconBg,
    }
  }
  return {
    ...place,
    iconId: place.iconId ?? '',
    iconBg: place.iconBg ?? '',
  }
}

/** Создать новый главный объект хранения (например «Квартира в Химках»). */
export async function addRootObject(input: {
  name: string
  iconId?: ObjectIconId
  iconBg?: string
}): Promise<Place> {
  const settings = await getSettings()
  const trimmed = input.name.trim()
  if (!trimmed) throw new Error('Укажите название')

  const existing = await listPlaces()
  if (
    existing.some(
      (place) =>
        place.type === 'object' && normalizeSearch(place.name) === normalizeSearch(trimmed),
    )
  ) {
    throw new Error('Объект с таким названием уже есть')
  }

  const objectKey: ObjectKey = `obj_${newId().replaceAll('-', '').slice(0, 10)}`
  const look = defaultObjectAppearance(objectKey)
  const place: Place = {
    id: newId(),
    familyId: settings.familyId,
    parentId: null,
    objectKey,
    name: trimmed,
    type: 'object',
    code: trimmed,
    note: '',
    iconId: input.iconId ?? look.iconId,
    iconBg: input.iconBg ?? look.iconBg,
    archived: false,
    visibility: 'shared',
    version: 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.places.put(place)
  return place
}

export async function updateRootAppearance(
  placeId: string,
  patch: { iconId?: ObjectIconId; iconBg?: string; name?: string },
): Promise<Place> {
  const place = await getPlace(placeId)
  if (!place || place.type !== 'object') throw new Error('Главный объект не найден')

  const nextName = patch.name?.trim()
  if (nextName !== undefined && !nextName) throw new Error('Укажите название')

  if (nextName && nextName !== place.name) {
    const existing = await listPlaces()
    if (
      existing.some(
        (entry) =>
          entry.id !== place.id &&
          entry.type === 'object' &&
          normalizeSearch(entry.name) === normalizeSearch(nextName),
      )
    ) {
      throw new Error('Объект с таким названием уже есть')
    }
  }

  const next: Place = {
    ...place,
    name: nextName ?? place.name,
    iconId: patch.iconId ?? place.iconId,
    iconBg: patch.iconBg ?? place.iconBg,
    version: place.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.places.put(next)
  if (nextName && nextName !== place.name) {
    await refreshPlaceCodesFromTree()
  }
  const updated = await getPlace(placeId)
  if (!updated) throw new Error('Объект не найден')
  return normalizePlace(updated)
}

export async function getSettings(): Promise<AppSettings> {
  return ensureSeeded()
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = normalizeSettings({ ...current, ...patch, id: 'settings' as const })
  await db.settings.put(next)
  return next
}

async function saveCategoryTree(tree: CategoryNode[]): Promise<AppSettings> {
  return updateSettings({ categories: cloneCategoryTree(tree) })
}

async function rewriteItemCategories(
  match: { category: string; subcategory?: string | null },
  next: { category: string; subcategory?: string | null },
): Promise<void> {
  const items = await db.items.toArray()
  const updates: Item[] = []
  for (const item of items) {
    const sameCategory = normalizeCategoryName(item.category) === normalizeCategoryName(match.category)
    if (!sameCategory) continue
    if (match.subcategory != null) {
      if (normalizeCategoryName(item.subcategory) !== normalizeCategoryName(match.subcategory)) continue
    }
    updates.push({
      ...item,
      category: next.category,
      subcategory:
        next.subcategory === null
          ? ''
          : next.subcategory !== undefined
            ? next.subcategory
            : item.subcategory,
      version: item.version + 1,
      updatedAt: nowIso(),
      syncStatus: 'pending',
    })
  }
  if (updates.length) await db.items.bulkPut(updates)
}

export async function addCategory(name: string): Promise<AppSettings> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Укажите название категории')
  const settings = await getSettings()
  const tree = cloneCategoryTree(settings.categories)
  if (tree.some((node) => normalizeCategoryName(node.name) === normalizeCategoryName(trimmed))) {
    throw new Error('Такая категория уже есть')
  }
  tree.push({ name: trimmed, children: [] })
  tree.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return saveCategoryTree(tree)
}

export async function renameCategory(oldName: string, newName: string): Promise<AppSettings> {
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Укажите название категории')
  const settings = await getSettings()
  const tree = cloneCategoryTree(settings.categories)
  const index = tree.findIndex(
    (node) => normalizeCategoryName(node.name) === normalizeCategoryName(oldName),
  )
  if (index < 0) throw new Error('Категория не найдена')
  if (
    tree.some(
      (node, i) =>
        i !== index && normalizeCategoryName(node.name) === normalizeCategoryName(trimmed),
    )
  ) {
    throw new Error('Такая категория уже есть')
  }
  const previous = tree[index]!.name
  tree[index] = { ...tree[index]!, name: trimmed }
  tree.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  await rewriteItemCategories({ category: previous }, { category: trimmed })
  return saveCategoryTree(tree)
}

export async function deleteCategory(name: string): Promise<AppSettings> {
  const settings = await getSettings()
  const tree = cloneCategoryTree(settings.categories)
  if (tree.length <= 1) throw new Error('Нельзя удалить последнюю категорию')
  const index = tree.findIndex(
    (node) => normalizeCategoryName(node.name) === normalizeCategoryName(name),
  )
  if (index < 0) throw new Error('Категория не найдена')
  const used = (await db.items.toArray()).some(
    (item) => normalizeCategoryName(item.category) === normalizeCategoryName(name),
  )
  if (used) {
    throw new Error('Сначала переназначьте вещи из этой категории')
  }
  tree.splice(index, 1)
  return saveCategoryTree(tree)
}

export async function addSubcategory(categoryName: string, name: string): Promise<AppSettings> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Укажите название подкатегории')
  const settings = await getSettings()
  const tree = cloneCategoryTree(settings.categories)
  const node = tree.find(
    (entry) => normalizeCategoryName(entry.name) === normalizeCategoryName(categoryName),
  )
  if (!node) throw new Error('Категория не найдена')
  if (node.children.some((child) => normalizeCategoryName(child) === normalizeCategoryName(trimmed))) {
    throw new Error('Такая подкатегория уже есть')
  }
  node.children.push(trimmed)
  node.children.sort((a, b) => a.localeCompare(b, 'ru'))
  return saveCategoryTree(tree)
}

export async function renameSubcategory(
  categoryName: string,
  oldName: string,
  newName: string,
): Promise<AppSettings> {
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Укажите название подкатегории')
  const settings = await getSettings()
  const tree = cloneCategoryTree(settings.categories)
  const node = tree.find(
    (entry) => normalizeCategoryName(entry.name) === normalizeCategoryName(categoryName),
  )
  if (!node) throw new Error('Категория не найдена')
  const index = node.children.findIndex(
    (child) => normalizeCategoryName(child) === normalizeCategoryName(oldName),
  )
  if (index < 0) throw new Error('Подкатегория не найдена')
  if (
    node.children.some(
      (child, i) =>
        i !== index && normalizeCategoryName(child) === normalizeCategoryName(trimmed),
    )
  ) {
    throw new Error('Такая подкатегория уже есть')
  }
  const previous = node.children[index]!
  node.children[index] = trimmed
  node.children.sort((a, b) => a.localeCompare(b, 'ru'))
  await rewriteItemCategories(
    { category: node.name, subcategory: previous },
    { category: node.name, subcategory: trimmed },
  )
  return saveCategoryTree(tree)
}

export async function deleteSubcategory(categoryName: string, name: string): Promise<AppSettings> {
  const settings = await getSettings()
  const tree = cloneCategoryTree(settings.categories)
  const node = tree.find(
    (entry) => normalizeCategoryName(entry.name) === normalizeCategoryName(categoryName),
  )
  if (!node) throw new Error('Категория не найдена')
  const used = (await db.items.toArray()).some(
    (item) =>
      normalizeCategoryName(item.category) === normalizeCategoryName(categoryName) &&
      normalizeCategoryName(item.subcategory) === normalizeCategoryName(name),
  )
  if (used) {
    throw new Error('Сначала переназначьте вещи из этой подкатегории')
  }
  node.children = node.children.filter(
    (child) => normalizeCategoryName(child) !== normalizeCategoryName(name),
  )
  return saveCategoryTree(tree)
}

export async function listPlaces(objectKey?: ObjectKey): Promise<Place[]> {
  const settings = await ensureSeeded()
  const all = await db.places.toArray()
  return all
    .filter(
      (place) =>
        !place.archived &&
        place.familyId === settings.familyId &&
        (!objectKey || place.objectKey === objectKey),
    )
    .map(normalizePlace)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function getPlace(id: string): Promise<Place | undefined> {
  const place = await db.places.get(id)
  return place ? normalizePlace(place) : undefined
}

export async function childrenOf(placeId: string): Promise<Place[]> {
  const all = await db.places.where('parentId').equals(placeId).toArray()
  return all.filter((place) => !place.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function placePath(placeId: string, places: Place[]): Place[] {
  const map = new Map(places.map((place) => [place.id, place]))
  const path: Place[] = []
  let current = map.get(placeId)
  while (current) {
    path.unshift(current)
    current = current.parentId ? map.get(current.parentId) : undefined
  }
  return path
}

export async function addPlace(input: {
  parentId: string
  name: string
  type: PlaceType
  note?: string
}): Promise<Place> {
  const settings = await getSettings()
  const parent = await getPlace(input.parentId)
  if (!parent) throw new Error('Родительское место не найдено')

  const all = await db.places.toArray()
  const name = input.name.trim()
  const code = formatPlacePathCode([...placePathNames(parent.id, all), name])

  const place: Place = {
    id: newId(),
    familyId: settings.familyId,
    parentId: parent.id,
    objectKey: parent.objectKey,
    name,
    type: input.type,
    code,
    note: input.note?.trim() ?? '',
    iconId: '',
    iconBg: '',
    archived: false,
    visibility: 'shared',
    version: 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.places.put(place)
  return place
}

export async function renamePlace(placeId: string, name: string): Promise<Place> {
  const place = await getPlace(placeId)
  if (!place) throw new Error('Место не найдено')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Укажите название')
  await db.places.put({
    ...place,
    name: trimmed,
    version: place.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  })
  await refreshPlaceCodesFromTree()
  const updated = await getPlace(placeId)
  if (!updated) throw new Error('Место не найдено')
  return updated
}

function descendantIds(placeId: string, places: Place[]): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => {
    for (const child of places.filter((place) => place.parentId === id)) {
      ids.add(child.id)
      visit(child.id)
    }
  }
  visit(placeId)
  return ids
}

/** Коробка / контейнер можно переносить целиком, вместе с вложенными местами и вещами. */
export function movesWithContents(type: PlaceType): boolean {
  return type === 'box' || type === 'container'
}

async function placeSubtreeHasContent(placeId: string, nested: Set<string>): Promise<boolean> {
  if (nested.size > 0) return true
  const directItems = await db.items.where('placeId').equals(placeId).count()
  return directItems > 0
}

/** Перенести место под нового родителя. Коробки/контейнеры — вместе с содержимым. */
export async function movePlace(placeId: string, newParentId: string): Promise<Place> {
  const place = await getPlace(placeId)
  const parent = await getPlace(newParentId)
  if (!place || !parent) throw new Error('Не найдено')
  if (place.type === 'object') throw new Error('Корневой объект нельзя перенести')
  if (place.id === parent.id) throw new Error('Нельзя перенести место внутрь себя')
  if (place.parentId === parent.id) return place

  const all = await db.places.toArray()
  const nested = descendantIds(place.id, all)
  if (nested.has(parent.id)) {
    throw new Error('Нельзя перенести место внутрь его же вложенного места')
  }

  const hasContent = await placeSubtreeHasContent(place.id, nested)
  if (hasContent && !movesWithContents(place.type)) {
    throw new Error(
      'Сначала перенесите содержимое. Перенос вместе с содержимым доступен для коробок и контейнеров.',
    )
  }

  const at = nowIso()
  const objectKey = parent.objectKey
  const updates: Place[] = [
    {
      ...place,
      parentId: parent.id,
      objectKey,
      version: place.version + 1,
      updatedAt: at,
      syncStatus: 'pending',
    },
  ]
  // Вложенные места и вещи едут вместе с коробкой; при смене объекта обновляем objectKey
  if (place.objectKey !== objectKey) {
    for (const child of all.filter((entry) => nested.has(entry.id))) {
      updates.push({
        ...child,
        objectKey,
        version: child.version + 1,
        updatedAt: at,
        syncStatus: 'pending',
      })
    }
  }

  await db.places.bulkPut(updates)
  await refreshPlaceCodesFromTree()
  const updated = await getPlace(placeId)
  if (!updated) throw new Error('Место не найдено')
  return updated
}

/** Удалить пустое место (без вложенных мест и вещей). */
export async function deletePlace(placeId: string): Promise<void> {
  const place = await getPlace(placeId)
  if (!place) throw new Error('Место не найдено')
  if (place.type === 'object') throw new Error('Корневой объект нельзя удалить')

  const childCount = await db.places.where('parentId').equals(placeId).count()
  const itemCount = await db.items.where('placeId').equals(placeId).count()
  if (childCount > 0 || itemCount > 0) {
    throw new Error('Сначала перенесите вложенные места и вещи, затем удалите место')
  }

  await db.places.delete(placeId)
}

/** Нормализация старых записей без полей передачи. */
export function normalizeItem(item: Item): Item {
  return {
    ...item,
    lentTo: item.lentTo ?? '',
    lentAt: item.lentAt ?? '',
  }
}

export function isItemLent(item: Item): boolean {
  return Boolean(normalizeItem(item).lentTo.trim())
}

export function formatLentDate(lentAt: string): string {
  if (!lentAt) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lentAt)
  if (!match) return lentAt
  return `${match[3]}.${match[2]}.${match[1]}`
}

export async function listItems(options?: {
  objectKey?: ObjectKey
  placeId?: string
  query?: string
}): Promise<Item[]> {
  const settings = await ensureSeeded()
  const places = await listPlaces(options?.objectKey)
  const placeIds = new Set(places.map((place) => place.id))
  let items = (await db.items.toArray())
    .filter((item) => item.familyId === settings.familyId)
    .map(normalizeItem)

  if (options?.objectKey) {
    items = items.filter((item) => placeIds.has(item.placeId))
  }
  if (options?.placeId) {
    items = items.filter((item) => item.placeId === options.placeId)
  }
  if (options?.query?.trim()) {
    const q = normalizeSearch(options.query)
    items = items.filter((item) => {
      const hay = normalizeSearch([item.name, item.category, item.subcategory, item.note, ...item.tags].join(' '))
      return hay.includes(q)
    })
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function getItem(id: string): Promise<Item | undefined> {
  const item = await db.items.get(id)
  return item ? normalizeItem(item) : undefined
}

export async function addItem(input: {
  placeId: string
  name: string
  mode: AccountingMode
  category: string
  subcategory?: string
  unit: UnitCode
  quantity: number
  note?: string
}): Promise<Item> {
  const settings = await getSettings()
  const place = await getPlace(input.placeId)
  if (!place) throw new Error('Место не найдено')

  const name = input.name.trim()
  if (!input.category.trim()) throw new Error('Выберите категорию из справочника')

  // Расходники с тем же названием и единицей в том же месте — увеличиваем остаток
  if (input.mode === 'consumable') {
    const existing = (await db.items.where('placeId').equals(place.id).toArray()).find(
      (item) =>
        item.mode === 'consumable' &&
        item.unit === input.unit &&
        normalizeSearch(item.name) === normalizeSearch(name),
    )
    if (existing) {
      return updateItemQuantity(
        existing.id,
        existing.quantity + input.quantity,
        'in',
        'Добавление к существующей позиции',
      )
    }
  }

  const item: Item = {
    id: newId(),
    familyId: settings.familyId,
    placeId: place.id,
    name,
    mode: input.mode,
    category: input.category.trim() || (input.mode === 'consumable' ? 'Расходные материалы' : 'Прочее'),
    subcategory: input.subcategory?.trim() ?? '',
    unit: input.unit,
    quantity: input.quantity,
    note: input.note?.trim() ?? '',
    tags: [],
    needsFill: false,
    lentTo: '',
    lentAt: '',
    visibility: 'shared',
    version: 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.items.put(item)
  return item
}

export async function updateItem(
  itemId: string,
  patch: {
    name: string
    mode: AccountingMode
    category: string
    subcategory?: string
    unit: UnitCode
    quantity: number
    note?: string
    /** false — снять метку «Требует заполнения» */
    needsFill?: boolean
  },
): Promise<Item> {
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')

  const name = patch.name.trim()
  if (!name) throw new Error('Укажите название')
  if (patch.quantity < 0) throw new Error('Количество не может быть отрицательным')

  let note = (patch.note ?? item.note).trim()
  if (normalizeSearch(note) === normalizeSearch('Требует заполнения')) {
    note = ''
  }

  const unit = patch.mode === 'durable' ? 'pcs' : patch.unit
  if ((unit === 'pcs' || patch.mode === 'durable') && !Number.isInteger(patch.quantity)) {
    throw new Error('Для штук укажите целое количество')
  }

  const next: Item = {
    ...item,
    name,
    mode: patch.mode,
    category:
      patch.category.trim() ||
      (patch.mode === 'consumable' ? 'Расходные материалы' : item.category || 'Прочее'),
    subcategory: (patch.subcategory ?? item.subcategory).trim(),
    unit,
    quantity: patch.quantity,
    note,
    needsFill: patch.needsFill ?? item.needsFill,
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }

  await db.items.put(next)
  return normalizeItem(next)
}

/** Отметить временную передачу: у кого искать и дата. */
export async function lendItem(itemId: string, lentTo: string, lentAt: string): Promise<Item> {
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  const who = lentTo.trim()
  if (!who) throw new Error('Укажите, кому передали')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lentAt)) throw new Error('Укажите дату передачи')

  const next: Item = {
    ...item,
    lentTo: who,
    lentAt,
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.items.put(next)
  return next
}

/** Вернуть вещь с временной передачи (место хранения остаётся местом возврата). */
export async function returnLentItem(itemId: string): Promise<Item> {
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  if (!item.lentTo.trim()) return item

  const next: Item = {
    ...item,
    lentTo: '',
    lentAt: '',
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.items.put(next)
  return next
}

export async function updateItemQuantity(itemId: string, quantity: number, kind: 'in' | 'out' | 'adjust', note = ''): Promise<Item> {
  const settings = await getSettings()
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  if (quantity < 0) throw new Error('Количество не может быть отрицательным')
  if ((item.unit === 'pcs' || item.mode === 'durable') && !Number.isInteger(quantity)) {
    throw new Error('Для штук укажите целое количество')
  }

  const next: Item = {
    ...item,
    quantity,
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }

  await db.transaction('rw', db.items, db.moves, async () => {
    await db.items.put(next)
    await db.moves.put({
      id: newId(),
      familyId: settings.familyId,
      itemId: item.id,
      kind,
      quantity: Math.abs(quantity - item.quantity),
      unit: item.unit,
      placeId: item.placeId,
      note,
      authorName: settings.displayName,
      createdAt: nowIso(),
      syncStatus: 'pending',
    })
  })

  return next
}

export async function moveItem(itemId: string, placeId: string): Promise<Item> {
  const item = await getItem(itemId)
  const place = await getPlace(placeId)
  if (!item || !place) throw new Error('Не найдено')
  if (item.placeId === place.id) return item

  // Расходник с тем же названием уже в целевом месте — складываем остатки
  if (item.mode === 'consumable') {
    const twin = (await db.items.where('placeId').equals(place.id).toArray()).find(
      (entry) =>
        entry.id !== item.id &&
        entry.mode === 'consumable' &&
        entry.unit === item.unit &&
        normalizeSearch(entry.name) === normalizeSearch(item.name),
    )
    if (twin) {
      const merged = await updateItemQuantity(
        twin.id,
        twin.quantity + item.quantity,
        'in',
        `Перенос из другого места (+${item.quantity})`,
      )
      await db.items.delete(item.id)
      return merged
    }
  }

  const next: Item = {
    ...item,
    placeId: place.id,
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.items.put(next)
  return next
}

export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function createFreePlaces(parentId: string, count: number): Promise<Place[]> {
  const parent = await getPlace(parentId)
  if (!parent) throw new Error('Родитель не найден')
  const settings = await getSettings()
  const all = await db.places.toArray()
  const parentPath = placePathNames(parent.id, all)
  const at = nowIso()
  const created: Place[] = []
  for (let i = 0; i < count; i += 1) {
    const name = `Свободная метка ${i + 1}`
    const draft: Place = {
      id: newId(),
      familyId: settings.familyId,
      parentId: parent.id,
      objectKey: parent.objectKey,
      name,
      type: 'box',
      code: formatPlacePathCode([...parentPath, name]),
      note: 'Свободная метка — задайте название при первом сканировании',
      iconId: '',
      iconBg: '',
      archived: false,
      visibility: 'shared',
      version: 1,
      updatedAt: at,
      syncStatus: 'pending',
    }
    created.push(draft)
  }
  await db.places.bulkPut(created)
  return created
}

/** Пересчитать коды-пути у места и всех потомков после переименования/переноса. */
export async function refreshPlaceCodesFromTree(): Promise<void> {
  const places = await db.places.toArray()
  const updated = recomputePlaceCodes(places).map((place) => ({
    ...place,
    updatedAt: nowIso(),
    syncStatus: 'pending' as const,
  }))
  await db.places.bulkPut(updated)
}
