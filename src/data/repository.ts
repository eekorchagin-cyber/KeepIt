import type {
  AccountingMode,
  AppSettings,
  CategoryNode,
  Item,
  ObjectKey,
  Place,
  PlaceType,
  StockMove,
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
  scanKey,
} from './placeCodes'
import { defaultObjectAppearance, type ObjectIconId } from './icons'
import { PLACE_TYPE_LABEL, canNest, nestError } from './placeTypes'
import { buildDraftItems, buildSeedPlaces, defaultSettings } from './seed'
import { isCountableUnit, unitForMode } from './units'
import { addMonths } from './service'
import { learnCategory, pruneUnusedNames, upsertNames } from './itemNames'
import type { DraftItem } from './listImport/parseList'

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
    await repairPlaceObjectKeys()
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

/**
 * Метка объекта у места должна совпадать с объектом, в котором оно лежит по цепочке родителей.
 * Если разошлась (старые переносы, импорт) — вещи такого места не видны в поиске и списках объекта.
 */
async function repairPlaceObjectKeys(): Promise<void> {
  const places = await db.places.toArray()
  const byId = new Map(places.map((place) => [place.id, place]))
  const at = nowIso()
  const fixed: Place[] = []
  for (const place of places) {
    if (place.type === 'object') continue
    let current: Place | undefined = place
    for (let depth = 0; current && current.type !== 'object' && depth < 64; depth += 1) {
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    if (current?.type === 'object' && current.objectKey !== place.objectKey) {
      fixed.push({ ...place, objectKey: current.objectKey, version: place.version + 1, updatedAt: at, syncStatus: 'pending' })
    }
  }
  if (fixed.length) await db.places.bulkPut(fixed)
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
  if (!canNest(parent.type, input.type)) throw new Error(nestError(parent.type, input.type))

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

/**
 * Сменить тип места (например, ошибочную «Коробку» на «Полку»).
 * Проверяется, что новый тип подходит и к месту, где оно лежит, и к местам внутри него.
 */
export async function changePlaceType(placeId: string, type: PlaceType): Promise<Place> {
  const place = await getPlace(placeId)
  if (!place) throw new Error('Место не найдено')
  if (place.type === 'object' || type === 'object') throw new Error('Тип главного объекта не меняется')
  if (place.type === type) return place
  const parent = place.parentId ? await getPlace(place.parentId) : undefined
  if (parent && !canNest(parent.type, type)) throw new Error(nestError(parent.type, type))
  const children = await db.places.where('parentId').equals(place.id).toArray()
  const blocked = children.find((child) => !canNest(type, child.type))
  if (blocked) {
    throw new Error(
      `Внутри лежит «${blocked.name}» (${PLACE_TYPE_LABEL[blocked.type]}) — в «${PLACE_TYPE_LABEL[type]}» его положить нельзя. ` +
        'Сначала перенесите его или смените его тип.',
    )
  }
  const next: Place = { ...place, type, version: place.version + 1, updatedAt: nowIso(), syncStatus: 'pending' }
  await db.places.put(next)
  return next
}

export type CodeTarget = { kind: 'place' | 'item'; id: string }

function withoutCode<T extends { extraCodes?: string[]; version: number }>(entry: T, key: string, at: string): T {
  return {
    ...entry,
    extraCodes: (entry.extraCodes ?? []).filter((code) => code !== key),
    version: entry.version + 1,
    updatedAt: at,
    syncStatus: 'pending',
  }
}

/**
 * Присвоить отсканированный код вещи или месту: потом его скан открывает выбранное.
 * У кода один владелец — у прежнего он снимается. Свободная метка (пустая заготовка) после присвоения
 * удаляется: её QR теперь ведёт на выбранную вещь или место.
 */
export async function assignScanCode(raw: string, target: CodeTarget): Promise<void> {
  const key = scanKey(raw)
  if (!key) throw new Error('Пустой код')
  const at = nowIso()
  await db.transaction('rw', [db.places, db.items], async () => {
    if (key.startsWith('place:')) {
      const own = await db.places.get(key.slice('place:'.length))
      if (own) {
        const contents =
          (await db.places.where('parentId').equals(own.id).count()) +
          (await db.items.where('placeId').equals(own.id).count())
        if (!isUnusedFreeLabel(own) || contents > 0) {
          throw new Error(`Это метка места «${own.name}» — она уже открывает его.`)
        }
        await db.places.delete(own.id)
      }
    }
    if (key.startsWith('item:')) {
      const own = await db.items.get(key.slice('item:'.length))
      if (own) throw new Error(`Это метка вещи «${own.name}» — она уже открывает её карточку.`)
    }

    const placeOwners = await db.places.filter((place) => place.extraCodes?.includes(key) ?? false).toArray()
    for (const place of placeOwners) await db.places.put(withoutCode(place, key, at))
    const itemOwners = await db.items.filter((item) => item.extraCodes?.includes(key) ?? false).toArray()
    for (const item of itemOwners) await db.items.put(withoutCode(item, key, at))

    if (target.kind === 'place') {
      const place = await db.places.get(target.id)
      if (!place) throw new Error('Место не найдено')
      await db.places.put({ ...withoutCode(place, key, at), extraCodes: [...(place.extraCodes ?? []), key] })
    } else {
      const item = await db.items.get(target.id)
      if (!item) throw new Error('Вещь не найдена')
      await db.items.put({ ...withoutCode(item, key, at), extraCodes: [...(item.extraCodes ?? []), key] })
    }
  })
}

/** Отвязать присвоенный код: его скан снова станет незнакомым */
export async function unassignScanCode(target: CodeTarget, key: string): Promise<void> {
  const at = nowIso()
  if (target.kind === 'place') {
    const place = await db.places.get(target.id)
    if (place) await db.places.put(withoutCode(place, key, at))
  } else {
    const item = await db.items.get(target.id)
    if (item) await db.items.put(withoutCode(item, key, at))
  }
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

/** Перенести место под нового родителя вместе со всем, что в нём лежит (по правилам вложенности типов). */
export async function movePlace(placeId: string, newParentId: string): Promise<Place> {
  const place = await getPlace(placeId)
  const parent = await getPlace(newParentId)
  if (!place || !parent) throw new Error('Не найдено')
  if (place.type === 'object') throw new Error('Корневой объект нельзя перенести')
  if (place.id === parent.id) throw new Error('Нельзя перенести место внутрь себя')
  if (place.parentId === parent.id) return place
  if (!canNest(parent.type, place.type)) throw new Error(nestError(parent.type, place.type))

  const all = await db.places.toArray()
  const nested = descendantIds(place.id, all)
  if (nested.has(parent.id)) {
    throw new Error('Нельзя перенести место внутрь его же вложенного места')
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

/** Удалить место (любое, кроме главного объекта) вместе со всеми вложенными местами и вещами. */
export async function deletePlaceWithContents(placeId: string): Promise<{ places: number; items: number }> {
  const place = await getPlace(placeId)
  if (!place) throw new Error('Место не найдено')
  if (place.type === 'object') throw new Error('Главный объект нельзя удалить')
  const all = await db.places.toArray()
  const placeIds = [place.id, ...descendantIds(place.id, all)]
  const items = await db.items.where('placeId').anyOf(placeIds).toArray()
  await removeItemsAndPlaces(items, placeIds)
  return { places: placeIds.length, items: items.length }
}

/**
 * Удалить несколько мест разом: пустые — сразу, коробки и контейнеры — с содержимым.
 * Непустые помещения/полки пропускаются, чтобы не потерять вещи.
 */
export async function deletePlaces(
  placeIds: string[],
): Promise<{ places: number; items: number; skipped: string[] }> {
  const all = await db.places.toArray()
  const byId = new Map(all.map((place) => [place.id, place]))
  const placeSet = new Set<string>()
  const skipped: string[] = []

  for (const id of placeIds) {
    const place = byId.get(id)
    if (!place || place.type === 'object') continue
    const nested = [place.id, ...descendantIds(place.id, all)]
    const hasContent =
      nested.length > 1 || (await db.items.where('placeId').equals(place.id).count()) > 0
    if (hasContent && !movesWithContents(place.type)) {
      skipped.push(place.name)
      continue
    }
    for (const nestedId of nested) placeSet.add(nestedId)
  }

  const ids = [...placeSet]
  const items = ids.length ? await db.items.where('placeId').anyOf(ids).toArray() : []
  await removeItemsAndPlaces(items, ids)
  return { places: ids.length, items: items.length, skipped }
}

/**
 * Превратить вещь в место хранения (например, «Банка со свечными ключами» → коробка):
 * место создаётся там, где лежала вещь, сама вещь удаляется.
 */
export async function convertItemToPlace(
  itemId: string,
  input: { name: string; type: PlaceType },
): Promise<Place> {
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  if (isItemLent(item)) throw new Error('Вещь передана на время — сначала отметьте возврат')
  const parent = await getPlace(item.placeId)
  if (!parent) throw new Error('Место вещи не найдено')
  const name = input.name.trim()
  if (!name) throw new Error('Укажите название места')
  if (input.type === 'object') throw new Error('Выберите тип места')
  if (!canNest(parent.type, input.type)) throw new Error(nestError(parent.type, input.type))

  const settings = await getSettings()
  const all = await db.places.toArray()
  const place: Place = {
    id: newId(),
    familyId: settings.familyId,
    parentId: parent.id,
    objectKey: parent.objectKey,
    name,
    type: input.type,
    code: formatPlacePathCode([...placePathNames(parent.id, all), name]),
    note: item.note,
    iconId: '',
    iconBg: '',
    archived: false,
    visibility: 'shared',
    version: 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }

  await db.transaction('rw', [db.places, db.items, db.moves, db.itemNames], async () => {
    await db.places.put(place)
    const moveIds = (await db.moves.where('itemId').equals(item.id).toArray()).map((move) => move.id)
    if (moveIds.length) await db.moves.bulkDelete(moveIds)
    await db.items.delete(item.id)
    await pruneUnusedNames([item.name])
  })
  return place
}

/**
 * Объединить дубли в одну вещь `keepId`.
 * sum — сложить количество копий с той же единицей (их удалить), копии в других единицах остаются;
 * delete — удалить все копии, количество оставшейся вещи не меняется.
 */
export async function mergeDuplicates(
  keepId: string,
  duplicateIds: string[],
  mode: 'sum' | 'delete',
): Promise<{ removed: number; keptSeparate: number; quantity: number }> {
  const keeper = await getItem(keepId)
  if (!keeper) throw new Error('Вещь не найдена')
  const duplicates = (await db.items.bulkGet(duplicateIds.filter((id) => id !== keepId))).filter(
    (item): item is Item => Boolean(item),
  )
  const toRemove = mode === 'sum' ? duplicates.filter((item) => item.unit === keeper.unit) : duplicates
  const keptSeparate = duplicates.length - toRemove.length
  const added = mode === 'sum' ? toRemove.reduce((sum, item) => sum + item.quantity, 0) : 0

  const donor = duplicates.find((item) => item.category.trim() && !item.needsCategory)
  const takeCategory = (!keeper.category.trim() || keeper.needsCategory) && donor
  const settings = await getSettings()
  const at = nowIso()
  const next: Item = {
    ...keeper,
    quantity: keeper.quantity + added,
    category: takeCategory ? donor.category : keeper.category,
    subcategory: takeCategory ? donor.subcategory : keeper.subcategory,
    needsCategory: takeCategory ? false : keeper.needsCategory,
    note: keeper.note || duplicates.find((item) => item.note.trim())?.note || '',
    version: keeper.version + 1,
    updatedAt: at,
    syncStatus: 'pending',
  }

  await db.transaction('rw', [db.items, db.moves, db.itemNames, db.places], async () => {
    await db.items.put(next)
    if (added > 0) {
      await db.moves.put({
        id: newId(),
        familyId: settings.familyId,
        itemId: keeper.id,
        kind: 'adjust',
        quantity: added,
        unit: keeper.unit,
        placeId: keeper.placeId,
        note: `Объединение дублей (+${added})`,
        authorName: settings.displayName,
        createdAt: at,
        syncStatus: 'pending',
      })
    }
  })
  await removeItemsAndPlaces(toRemove, [])
  return { removed: toRemove.length, keptSeparate, quantity: next.quantity }
}

/** Удалить вещи (например, неверно распознанные при импорте) вместе с их движениями. */
export async function deleteItems(itemIds: string[]): Promise<number> {
  const items = (await db.items.bulkGet(itemIds)).filter((item): item is Item => Boolean(item))
  await removeItemsAndPlaces(items, [])
  return items.length
}

async function removeItemsAndPlaces(items: Item[], placeIds: string[]): Promise<void> {
  const itemIds = items.map((item) => item.id)
  await db.transaction('rw', [db.places, db.items, db.moves, db.itemNames], async () => {
    if (itemIds.length) {
      const moveIds = (await db.moves.where('itemId').anyOf(itemIds).toArray()).map((move) => move.id)
      if (moveIds.length) await db.moves.bulkDelete(moveIds)
      await db.items.bulkDelete(itemIds)
    }
    if (placeIds.length) await db.places.bulkDelete(placeIds)
    await pruneUnusedNames(items.map((item) => item.name))
  })
}

/** Нормализация старых записей без полей передачи. */
export function normalizeItem(item: Item): Item {
  return {
    ...item,
    needsCategory: item.needsCategory ?? false,
    lentTo: item.lentTo ?? '',
    lentAt: item.lentAt ?? '',
    serviceLastAt: item.serviceLastAt ?? '',
    serviceNextAt: item.serviceNextAt ?? '',
    serviceIntervalMonths: item.serviceIntervalMonths ?? 0,
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
    unit: unitForMode(input.mode, input.unit),
    quantity: input.quantity,
    note: input.note?.trim() ?? '',
    tags: [],
    needsFill: false,
    needsCategory: false,
    lentTo: '',
    lentAt: '',
    visibility: 'shared',
    version: 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.items.put(item)
  await learnCategory([item])
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

  const unit = unitForMode(patch.mode, patch.unit)
  if ((isCountableUnit(unit) || patch.mode === 'durable') && !Number.isInteger(patch.quantity)) {
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
    needsCategory: patch.category.trim() ? false : item.needsCategory,
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }

  await db.items.put(next)
  await learnCategory([next])
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

/** Сохранить даты ТО: последнее, следующее и интервал (0 — следующее вручную). */
export async function updateItemService(
  itemId: string,
  patch: { lastAt: string; nextAt: string; intervalMonths: number },
): Promise<Item> {
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  const check = (value: string, label: string) => {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Некорректная дата: ${label}`)
  }
  check(patch.lastAt, 'последнее ТО')
  check(patch.nextAt, 'следующее ТО')
  if (patch.lastAt && patch.nextAt && patch.nextAt < patch.lastAt) {
    throw new Error('Следующее ТО не может быть раньше последнего')
  }
  const next: Item = {
    ...item,
    serviceLastAt: patch.lastAt,
    serviceNextAt: patch.nextAt,
    serviceIntervalMonths: Math.max(0, Math.round(patch.intervalMonths)),
    version: item.version + 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  }
  await db.items.put(next)
  return normalizeItem(next)
}

/** Отметить проведённое ТО: дата последнего = date, следующее — по интервалу (если задан). */
export async function markServiceDone(itemId: string, date: string): Promise<Item> {
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  const interval = item.serviceIntervalMonths ?? 0
  return updateItemService(itemId, {
    lastAt: date,
    nextAt: interval > 0 ? addMonths(date, interval) : '',
    intervalMonths: interval,
  })
}

export async function updateItemQuantity(itemId: string, quantity: number, kind: 'in' | 'out' | 'adjust', note = ''): Promise<Item> {
  const settings = await getSettings()
  const item = await getItem(itemId)
  if (!item) throw new Error('Вещь не найдена')
  if (quantity < 0) throw new Error('Количество не может быть отрицательным')
  if ((isCountableUnit(item.unit) || item.mode === 'durable') && !Number.isInteger(quantity)) {
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

/** Перенести несколько мест (коробки — с содержимым) под одного родителя. */
export async function movePlaces(placeIds: string[], newParentId: string): Promise<number> {
  let moved = 0
  for (const id of placeIds) {
    await movePlace(id, newParentId)
    moved += 1
  }
  return moved
}

/** Перенести несколько вещей в одно место (расходники с тем же названием складываются). */
export async function moveItems(itemIds: string[], placeId: string): Promise<number> {
  const place = await getPlace(placeId)
  if (!place) throw new Error('Место не найдено')
  let moved = 0
  for (const id of itemIds) {
    await moveItem(id, place.id)
    moved += 1
  }
  return moved
}

/** Латинские буквы, неотличимые на вид от русских: «Фeн» с латинской e должен находиться по «фен» */
const LOOKALIKE_LATIN: Record<string, string> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
}

export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[abcehkmoptxy]/g, (letter) => LOOKALIKE_LATIN[letter] ?? letter)
    .replace(/\s+/g, ' ')
    .trim()
}

const FREE_LABEL_PREFIX = 'Свободная метка'
const FREE_LABEL_NOTE = 'Свободная метка — задайте название при первом сканировании'

/** Куда уместно класть свободные метки для будущих коробок (не внутрь коробки). */
export function canHoldFreeLabels(type: PlaceType): boolean {
  return type === 'object' || type === 'room' || type === 'cabinet'
}

/** Ещё не использованная свободная метка: имя и примечание не меняли. */
export function isUnusedFreeLabel(place: Place): boolean {
  return place.note === FREE_LABEL_NOTE && new RegExp(`^${FREE_LABEL_PREFIX} \\d+$`).test(place.name)
}

export async function createFreePlaces(parentId: string, count: number): Promise<Place[]> {
  const parent = await getPlace(parentId)
  if (!parent) throw new Error('Родитель не найден')
  if (!canHoldFreeLabels(parent.type)) {
    throw new Error('Свободные метки создаются в объекте, помещении или шкафу, а не внутри коробки')
  }
  const settings = await getSettings()
  const all = await db.places.toArray()
  const parentPath = placePathNames(parent.id, all)
  const at = nowIso()
  const created: Place[] = []
  const lastNumber = all
    .filter((place) => place.parentId === parent.id)
    .map((place) => new RegExp(`^${FREE_LABEL_PREFIX} (\\d+)$`).exec(place.name)?.[1])
    .reduce((max, value) => Math.max(max, value ? Number(value) : 0), 0)
  for (let i = 0; i < count; i += 1) {
    const name = `${FREE_LABEL_PREFIX} ${lastNumber + i + 1}`
    const draft: Place = {
      id: newId(),
      familyId: settings.familyId,
      parentId: parent.id,
      objectKey: parent.objectKey,
      name,
      type: 'box',
      code: formatPlacePathCode([...parentPath, name]),
      note: FREE_LABEL_NOTE,
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

/** Готовый к записи результат импорта: конфликты уже разобраны пользователем. */
export type ImportPlan = {
  boxes: Array<{ key: string; name: string; existingPlaceId: string | null }>
  items: Array<{
    /** null — вещь кладётся прямо в место импорта */
    boxKey: string | null
    draft: DraftItem
    /** Сложить количество с этой вещью вместо создания новой */
    mergeIntoId: string | null
  }>
}

export type ImportResult = {
  boxesCreated: number
  itemsCreated: number
  itemsMerged: number
  itemIds: string[]
}

export type ImportProgress = { done: number; total: number }

const IMPORT_CHUNK = 100

async function putInChunks<T>(rows: T[], put: (chunk: T[]) => Promise<unknown>, step: (count: number) => void) {
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK)
    await put(chunk)
    step(chunk.length)
  }
}

export async function applyImportPlan(
  placeId: string,
  plan: ImportPlan,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const settings = await getSettings()
  const parent = await getPlace(placeId)
  if (!parent) throw new Error('Место не найдено')

  const at = nowIso()
  const allPlaces = await db.places.toArray()
  const parentPath = placePathNames(parent.id, allPlaces)
  const boxIds = new Map<string, string>()
  const newPlaces: Place[] = []

  for (const box of plan.boxes) {
    if (box.existingPlaceId) {
      boxIds.set(box.key, box.existingPlaceId)
      continue
    }
    const name = box.name.trim()
    const place: Place = {
      id: newId(),
      familyId: settings.familyId,
      parentId: parent.id,
      objectKey: parent.objectKey,
      name,
      type: 'box',
      code: formatPlacePathCode([...parentPath, name]),
      note: '',
      iconId: '',
      iconBg: '',
      archived: false,
      visibility: 'shared',
      version: 1,
      updatedAt: at,
      syncStatus: 'pending',
    }
    boxIds.set(box.key, place.id)
    newPlaces.push(place)
  }

  const newItems: Item[] = []
  const merges = new Map<string, number>()
  for (const entry of plan.items) {
    if (entry.mergeIntoId) {
      merges.set(entry.mergeIntoId, (merges.get(entry.mergeIntoId) ?? 0) + entry.draft.quantity)
      continue
    }
    const targetId = entry.boxKey ? boxIds.get(entry.boxKey) : parent.id
    if (!targetId) continue
    const { draft } = entry
    newItems.push({
      id: newId(),
      familyId: settings.familyId,
      placeId: targetId,
      name: draft.name.trim(),
      mode: draft.mode,
      category: '',
      subcategory: '',
      unit: unitForMode(draft.mode, draft.unit),
      quantity: draft.quantity,
      note: draft.warning ?? '',
      tags: [],
      needsFill: false,
      needsCategory: true,
      lentTo: '',
      lentAt: '',
      visibility: 'shared',
      version: 1,
      updatedAt: at,
      syncStatus: 'pending',
    })
  }

  const mergeTargets = (await db.items.bulkGet([...merges.keys()])).filter(
    (item): item is Item => Boolean(item),
  )
  const mergedItems = mergeTargets.map((item) => ({
    ...item,
    quantity: item.quantity + (merges.get(item.id) ?? 0),
    version: item.version + 1,
    updatedAt: at,
    syncStatus: 'pending' as const,
  }))
  const moves: StockMove[] = mergeTargets.map((item) => ({
    id: newId(),
    familyId: settings.familyId,
    itemId: item.id,
    kind: 'in',
    quantity: merges.get(item.id) ?? 0,
    unit: item.unit,
    placeId: item.placeId,
    note: 'Импорт списка',
    authorName: settings.displayName,
    createdAt: at,
    syncStatus: 'pending',
  }))

  const drafts = plan.items.map((entry) => entry.draft)
  const total = newPlaces.length + newItems.length + mergedItems.length + drafts.length
  let done = 0
  const step = (count: number) => {
    done += count
    onProgress?.({ done, total })
  }
  onProgress?.({ done, total })

  await db.transaction('rw', [db.places, db.items, db.moves, db.itemNames], async () => {
    await putInChunks(newPlaces, (chunk) => db.places.bulkPut(chunk), step)
    await putInChunks(newItems, (chunk) => db.items.bulkPut(chunk), step)
    await putInChunks(mergedItems, (chunk) => db.items.bulkPut(chunk), step)
    if (moves.length) await db.moves.bulkPut(moves)
    await putInChunks(drafts, (chunk) => upsertNames(chunk), step)
  })

  return {
    boxesCreated: newPlaces.length,
    itemsCreated: newItems.length,
    itemsMerged: mergedItems.length,
    itemIds: newItems.map((item) => item.id),
  }
}

/** Массово назначить категорию; режим — по желанию. Снимает «без категории» и обучает справочник. */
export async function assignCategory(
  itemIds: string[],
  category: string,
  subcategory: string,
  mode?: AccountingMode,
): Promise<number> {
  const trimmed = category.trim()
  if (!trimmed) throw new Error('Выберите категорию')
  const items = (await db.items.bulkGet(itemIds)).filter((item): item is Item => Boolean(item))
  const at = nowIso()
  const updates = items.map((item) => {
    const nextMode = mode && canSwitchMode(item, mode) ? mode : item.mode
    return {
      ...normalizeItem(item),
      category: trimmed,
      subcategory: subcategory.trim(),
      mode: nextMode,
      unit: unitForMode(nextMode, item.unit),
      needsCategory: false,
      version: item.version + 1,
      updatedAt: at,
      syncStatus: 'pending' as const,
    }
  })
  await db.transaction('rw', [db.items, db.itemNames], async () => {
    await db.items.bulkPut(updates)
    await learnCategory(updates)
  })
  return updates.length
}

export type InventoryApply = {
  /** Найдено другое количество */
  changed: Array<{ itemId: string; quantity: number }>
  /** Не найдены и выбраны к удалению */
  removeIds: string[]
  /** Нашлись в проверенном месте, а записаны в другом; quantity меньше записанного — переносится часть */
  moves: Array<{ itemId: string; placeId: string; quantity: number }>
  /** Нашлись и нигде не записаны — добавляются «без категории» */
  added: Array<{ placeId: string; name: string; quantity: number; unit: UnitCode; mode: AccountingMode }>
  /** Проверенные места — получают дату инвентаризации */
  checkedPlaceIds: string[]
  date: string
}

/**
 * Перенести часть вещи: в записи остаётся остаток, в новом месте появляется запись на перенесённое
 * (расходник складывается с таким же). Всё количество — обычный перенос.
 */
export async function moveItemPart(itemId: string, quantity: number, placeId: string): Promise<void> {
  const item = await getItem(itemId)
  if (!item || quantity <= 0) return
  if (quantity >= item.quantity) {
    await moveItem(itemId, placeId)
    return
  }
  const place = await getPlace(placeId)
  if (!place) throw new Error('Место не найдено')
  const twin =
    item.mode === 'consumable'
      ? (await db.items.where('placeId').equals(place.id).toArray()).find(
          (entry) =>
            entry.mode === 'consumable' &&
            entry.unit === item.unit &&
            normalizeSearch(entry.name) === normalizeSearch(item.name),
        )
      : undefined
  await updateItemQuantity(item.id, item.quantity - quantity, 'out', `Инвентаризация: ${quantity} нашлось в «${place.name}»`)
  if (twin) {
    await updateItemQuantity(twin.id, twin.quantity + quantity, 'in', 'Инвентаризация: перенос части')
    return
  }
  await db.items.put({
    ...normalizeItem(item),
    id: newId(),
    placeId: place.id,
    quantity,
    version: 1,
    updatedAt: nowIso(),
    syncStatus: 'pending',
  })
}

/** Итог инвентаризации: корректировки остатков, переносы, новые и удалённые вещи, дата проверки мест. */
export async function applyInventory(input: InventoryApply): Promise<void> {
  // Сначала переносы: после переноса части в записи остаётся остаток, и корректировка задаётся уже от него
  for (const move of input.moves) await moveItemPart(move.itemId, move.quantity, move.placeId)
  for (const change of input.changed) {
    await updateItemQuantity(change.itemId, change.quantity, 'adjust', 'Инвентаризация')
  }
  if (input.removeIds.length) await deleteItems(input.removeIds)

  const settings = await getSettings()
  const at = nowIso()
  const newItems: Item[] = input.added.map((entry) => ({
    id: newId(),
    familyId: settings.familyId,
    placeId: entry.placeId,
    name: entry.name.trim(),
    mode: entry.mode,
    category: '',
    subcategory: '',
    unit: unitForMode(entry.mode, entry.unit),
    quantity: entry.quantity,
    note: '',
    tags: [],
    needsFill: false,
    needsCategory: true,
    lentTo: '',
    lentAt: '',
    visibility: 'shared',
    version: 1,
    updatedAt: at,
    syncStatus: 'pending',
  }))
  const places = (await db.places.bulkGet(input.checkedPlaceIds)).filter((place): place is Place => Boolean(place))
  await db.transaction('rw', [db.places, db.items, db.itemNames], async () => {
    if (newItems.length) {
      await db.items.bulkPut(newItems)
      await upsertNames(newItems.map((item) => ({ name: item.name, mode: item.mode, unit: item.unit })))
    }
    if (places.length) {
      await db.places.bulkPut(
        places.map((place) => ({
          ...place,
          inventoriedAt: input.date,
          version: place.version + 1,
          updatedAt: at,
          syncStatus: 'pending' as const,
        })),
      )
    }
  })
}

/** Постоянное хранение возможно только для целого количества. */
function canSwitchMode(item: Item, mode: AccountingMode): boolean {
  return mode === 'consumable' || Number.isInteger(item.quantity)
}

export async function setItemsMode(itemIds: string[], mode: AccountingMode): Promise<number> {
  const items = (await db.items.bulkGet(itemIds)).filter((item): item is Item => Boolean(item))
  const at = nowIso()
  const updates = items
    .filter((item) => item.mode !== mode && canSwitchMode(item, mode))
    .map((item) => ({
      ...item,
      mode,
      unit: unitForMode(mode, item.unit),
      version: item.version + 1,
      updatedAt: at,
      syncStatus: 'pending' as const,
    }))
  if (updates.length) await db.items.bulkPut(updates)
  return updates.length
}
