import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  exportBackup,
  importBackupFromText,
  type ImportSummary,
} from '../data/backup'
import {
  addCategory,
  addItem,
  addPlace,
  addRootObject,
  addSubcategory,
  applyImportPlan,
  assignCategory,
  convertItemToPlace,
  mergeDuplicates,
  deleteItems,
  deletePlaceWithContents,
  deletePlaces,
  setItemsMode,
  type ImportPlan,
  type ImportProgress,
  type ImportResult,
  createFreePlaces,
  deleteCategory,
  deletePlace,
  deleteSubcategory,
  getSettings,
  listItems,
  listPlaces,
  isItemLent,
  lendItem,
  moveItem,
  moveItems,
  movePlace,
  movePlaces,
  placePath,
  renameCategory,
  renamePlace,
  renameSubcategory,
  returnLentItem,
  updateItem,
  updateItemQuantity,
  updateRootAppearance,
  updateSettings,
} from '../data/repository'
import { cloneCategoryTree, sortCategoryTree } from '../data/categories'
import type { ObjectIconId } from '../data/icons'
import { findDuplicateGroups, type DuplicateGroup } from '../data/duplicates'
import { listItemNames } from '../data/itemNames'
import type {
  AccountingMode,
  AppSettings,
  CategoryNode,
  Item,
  ItemName,
  ObjectKey,
  Place,
  PlaceType,
  Screen,
  ThemeMode,
  UnitCode,
} from '../types'

function sameScreen(a: Screen, b: Screen): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function fallbackParent(screen: Screen, places: Place[]): Screen {
  switch (screen.name) {
    case 'home':
      return { name: 'home' }
    case 'object':
      return { name: 'home' }
    case 'place': {
      const place = places.find((entry) => entry.id === screen.placeId)
      if (!place) return { name: 'home' }
      if (place.parentId) return { name: 'place', placeId: place.parentId }
      return { name: 'object', objectKey: place.objectKey }
    }
    case 'add-item':
    case 'import-list':
    case 'gather-items':
      return { name: 'place', placeId: screen.placeId }
    case 'categorize':
    case 'duplicates':
      return screen.placeId ? { name: 'place', placeId: screen.placeId } : { name: 'more' }
    case 'item':
      return { name: 'home' }
    case 'edit-item':
      return { name: 'item', itemId: screen.itemId }
    case 'settings':
    case 'print':
    case 'lent':
    case 'categories':
      return { name: 'more' }
    case 'scan':
    case 'search':
    case 'more':
      return { name: 'home' }
  }
}

export type KeepItState = {
  loading: boolean
  settings: AppSettings | null
  places: Place[]
  items: Item[]
  categories: CategoryNode[]
  /** Справочник названий вещей */
  itemNames: ItemName[]
  screen: Screen
  error: string | null
  canGoBack: boolean
  refresh: () => Promise<void>
  navigate: (screen: Screen) => void
  jump: (screen: Screen) => void
  goBack: () => void
  setScreen: (screen: Screen) => void
  setActiveObject: (objectKey: ObjectKey) => Promise<void>
  setTheme: (theme: ThemeMode) => Promise<void>
  addCategory: (name: string) => Promise<void>
  renameCategory: (oldName: string, newName: string) => Promise<void>
  deleteCategory: (name: string) => Promise<void>
  addSubcategory: (categoryName: string, name: string) => Promise<void>
  renameSubcategory: (categoryName: string, oldName: string, newName: string) => Promise<void>
  deleteSubcategory: (categoryName: string, name: string) => Promise<void>
  createChildPlace: (parentId: string, name: string, type: PlaceType) => Promise<Place>
  createRootObject: (input: {
    name: string
    iconId?: ObjectIconId
    iconBg?: string
  }) => Promise<Place>
  updateRootLook: (
    placeId: string,
    patch: { iconId?: ObjectIconId; iconBg?: string; name?: string },
  ) => Promise<Place>
  renameCurrentPlace: (placeId: string, name: string) => Promise<Place>
  relocatePlace: (placeId: string, parentId: string) => Promise<Place>
  removePlace: (placeId: string) => Promise<void>
  createItem: (input: {
    placeId: string
    name: string
    mode: AccountingMode
    category: string
    subcategory?: string
    unit: UnitCode
    quantity: number
    note?: string
  }) => Promise<Item>
  changeQuantity: (itemId: string, quantity: number, kind: 'in' | 'out' | 'adjust', note?: string) => Promise<void>
  updateItemCard: (itemId: string, patch: {
    name: string
    mode: AccountingMode
    category: string
    subcategory?: string
    unit: UnitCode
    quantity: number
    note?: string
    needsFill?: boolean
  }) => Promise<Item>
  relocateItem: (itemId: string, placeId: string) => Promise<Item>
  /** Перенести несколько вещей в одно место */
  relocateItems: (itemIds: string[], placeId: string) => Promise<number>
  /** Перенести несколько мест (коробки — с содержимым) в одно место */
  relocatePlaces: (placeIds: string[], parentId: string) => Promise<number>
  lendOutItem: (itemId: string, lentTo: string, lentAt: string) => Promise<Item>
  returnFromLend: (itemId: string) => Promise<Item>
  makeFreeLabels: (parentId: string, count: number) => Promise<Place[]>
  pathFor: (placeId: string) => Place[]
  findPlace: (id: string) => Place | undefined
  findItem: (id: string) => Item | undefined
  childPlaces: (placeId: string) => Place[]
  itemsInPlace: (placeId: string) => Item[]
  /** Сумма количеств вещей в месте и всех вложенных местах */
  stockInSubtree: (placeId: string) => { total: number; unit: UnitCode | null; itemCount: number }
  searchItems: (query: string) => Item[]
  /** Все переданные на время вещи (по всем объектам) */
  lentItems: () => Item[]
  /** Скачать/поделиться JSON-резервной копией */
  exportData: () => Promise<void>
  /** Заменить локальные данные текстом JSON-бэкапа (уже прочитанным из файла) */
  importData: (text: string) => Promise<ImportSummary>
  /** Записать разобранный текстовый список в место */
  importList: (
    placeId: string,
    plan: ImportPlan,
    onProgress?: (progress: ImportProgress) => void,
  ) => Promise<ImportResult>
  assignCategories: (
    itemIds: string[],
    category: string,
    subcategory: string,
    mode?: AccountingMode,
  ) => Promise<void>
  setModeFor: (itemIds: string[], mode: AccountingMode) => Promise<number>
  /** Вещи без категории (после импорта) по всем объектам; с placeId — в месте и вложенных */
  uncategorizedItems: (placeId?: string) => Item[]
  removeItems: (itemIds: string[]) => Promise<number>
  /** Объединить дубли: sum — сложить количество, delete — удалить копии */
  mergeItemDuplicates: (
    keepId: string,
    duplicateIds: string[],
    mode: 'sum' | 'delete',
  ) => Promise<{ removed: number; keptSeparate: number; quantity: number }>
  /** Вещь становится местом хранения там же, где лежала */
  itemToPlace: (itemId: string, input: { name: string; type: PlaceType }) => Promise<Place>
  /** Коробка/контейнер вместе с вложенными местами и вещами */
  removePlaceWithContents: (placeId: string) => Promise<void>
  /** Несколько мест разом; непустые помещения/полки пропускаются */
  removePlaces: (placeIds: string[]) => Promise<{ places: number; items: number; skipped: string[] }>
  /** Группы дублей (одинаковое название в одном месте): в месте и вложенных или во всём активном объекте */
  duplicateGroups: (placeId?: string) => DuplicateGroup[]
  /** Сколько вложенных мест и вещей во всём поддереве места */
  contentsOf: (placeId: string) => { places: number; items: number }
}

function applyTheme(theme: ThemeMode, fontScale: number) {
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.setProperty('--font-scale', String(fontScale))
}

export function useKeepIt(): KeepItState {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [itemNames, setItemNames] = useState<ItemName[]>([])
  const [screen, setScreenState] = useState<Screen>({ name: 'home' })
  const [history, setHistory] = useState<Screen[]>([])
  const [error, setError] = useState<string | null>(null)
  const screenRef = useRef(screen)
  const historyRef = useRef(history)
  screenRef.current = screen
  historyRef.current = history

  const refresh = useCallback(async () => {
    const nextSettings = await getSettings()
    const nextPlaces = await listPlaces()
    const nextItems = await listItems()
    const nextNames = await listItemNames()
    setSettings(nextSettings)
    setPlaces(nextPlaces)
    setItems(nextItems)
    setItemNames(nextNames)
    applyTheme(nextSettings.theme, nextSettings.fontScale)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  useEffect(() => {
    const onHash = () => {
      const hash = location.hash.replace(/^#/, '')
      const match = hash.match(/^\/place\/([0-9a-f-]{36})$/i)
      if (match?.[1]) {
        setHistory([])
        setScreenState({ name: 'place', placeId: match[1] })
      }
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const visibleItems = useMemo(() => {
    const objectKey = settings?.activeObject
    if (!objectKey) return items
    const placeIds = new Set(places.filter((place) => place.objectKey === objectKey).map((place) => place.id))
    return items.filter((item) => placeIds.has(item.placeId))
  }, [items, places, settings?.activeObject])

  const savedCategories = settings?.categories
  const categories = useMemo(
    () => sortCategoryTree(savedCategories?.length ? savedCategories : cloneCategoryTree()),
    [savedCategories],
  )

  const lentList = useMemo(
    () =>
      items
        .filter(isItemLent)
        .sort(
          (a, b) =>
            (b.lentAt || '').localeCompare(a.lentAt || '') || a.name.localeCompare(b.name, 'ru'),
        ),
    [items],
  )

  const navigate = useCallback((next: Screen) => {
    const current = screenRef.current
    if (sameScreen(current, next)) return
    setHistory((prev) => [...prev, current])
    setScreenState(next)
  }, [])

  const jump = useCallback((next: Screen) => {
    setHistory([])
    setScreenState(next)
  }, [])

  const goBack = useCallback(() => {
    const prev = historyRef.current
    if (prev.length > 0) {
      const target = prev[prev.length - 1]!
      setHistory(prev.slice(0, -1))
      setScreenState(target)
      return
    }
    const current = screenRef.current
    if (current.name === 'item') {
      const item = items.find((entry) => entry.id === current.itemId)
      if (item) {
        setScreenState({ name: 'place', placeId: item.placeId })
        return
      }
    }
    setScreenState(fallbackParent(current, places))
  }, [items, places])

  const canGoBack = history.length > 0 || screen.name !== 'home'

  return {
    loading,
    settings,
    places,
    items: visibleItems,
    categories,
    itemNames,
    screen,
    error,
    canGoBack,
    refresh,
    navigate,
    jump,
    goBack,
    setScreen: navigate,
    setActiveObject: async (objectKey) => {
      await updateSettings({ activeObject: objectKey })
      await refresh()
    },
    setTheme: async (theme) => {
      const next = await updateSettings({ theme })
      applyTheme(next.theme, next.fontScale)
      setSettings(next)
    },
    addCategory: async (name) => {
      await addCategory(name)
      await refresh()
    },
    renameCategory: async (oldName, newName) => {
      await renameCategory(oldName, newName)
      await refresh()
    },
    deleteCategory: async (name) => {
      await deleteCategory(name)
      await refresh()
    },
    addSubcategory: async (categoryName, name) => {
      await addSubcategory(categoryName, name)
      await refresh()
    },
    renameSubcategory: async (categoryName, oldName, newName) => {
      await renameSubcategory(categoryName, oldName, newName)
      await refresh()
    },
    deleteSubcategory: async (categoryName, name) => {
      await deleteSubcategory(categoryName, name)
      await refresh()
    },
    createChildPlace: async (parentId, name, type) => {
      const place = await addPlace({ parentId, name, type })
      await refresh()
      return place
    },
    createRootObject: async (input) => {
      const place = await addRootObject(input)
      await refresh()
      return place
    },
    updateRootLook: async (placeId, patch) => {
      const place = await updateRootAppearance(placeId, patch)
      await refresh()
      return place
    },
    renameCurrentPlace: async (placeId, name) => {
      const place = await renamePlace(placeId, name)
      await refresh()
      return place
    },
    relocatePlace: async (placeId, parentId) => {
      const moved = await movePlace(placeId, parentId)
      await refresh()
      return moved
    },
    removePlace: async (placeId) => {
      await deletePlace(placeId)
      await refresh()
    },
    createItem: async (input) => {
      const item = await addItem(input)
      await refresh()
      return item
    },
    changeQuantity: async (itemId, quantity, kind, note) => {
      await updateItemQuantity(itemId, quantity, kind, note)
      await refresh()
    },
    updateItemCard: async (itemId, patch) => {
      const next = await updateItem(itemId, patch)
      await refresh()
      return next
    },
    relocateItems: async (itemIds, placeId) => {
      const moved = await moveItems(itemIds, placeId)
      await refresh()
      return moved
    },
    relocatePlaces: async (placeIds, parentId) => {
      try {
        return await movePlaces(placeIds, parentId)
      } finally {
        await refresh()
      }
    },
    relocateItem: async (itemId, placeId) => {
      const moved = await moveItem(itemId, placeId)
      await refresh()
      return moved
    },
    lendOutItem: async (itemId, lentTo, lentAt) => {
      const next = await lendItem(itemId, lentTo, lentAt)
      await refresh()
      return next
    },
    returnFromLend: async (itemId) => {
      const next = await returnLentItem(itemId)
      await refresh()
      return next
    },
    makeFreeLabels: async (parentId, count) => {
      const created = await createFreePlaces(parentId, count)
      await refresh()
      return created
    },
    pathFor: (placeId) => placePath(placeId, places),
    findPlace: (id) => places.find((place) => place.id === id) ?? undefined,
    findItem: (id) => items.find((item) => item.id === id),
    childPlaces: (placeId) =>
      places.filter((place) => place.parentId === placeId).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    itemsInPlace: (placeId) => visibleItems.filter((item) => item.placeId === placeId),
    stockInSubtree: (placeId) => {
      const placeIds = subtreeIds(placeId, places)
      // Заготовки «требует заполнения» не участвуют в остатках
      const nested = visibleItems.filter((item) => placeIds.has(item.placeId) && !item.needsFill)
      const total = nested.reduce((sum, item) => sum + item.quantity, 0)
      const units = new Set(nested.map((item) => item.unit))
      return {
        total,
        unit: units.size === 1 ? (nested[0]?.unit ?? null) : null,
        itemCount: nested.length,
      }
    },
    searchItems: (query) => {
      const q = query.trim().toLowerCase().replaceAll('ё', 'е')
      if (!q) return visibleItems
      return visibleItems.filter((item) =>
        [item.name, item.category, item.subcategory, item.note].join(' ').toLowerCase().replaceAll('ё', 'е').includes(q),
      )
    },
    lentItems: () => lentList,
    exportData: async () => {
      await exportBackup()
    },
    importData: async (text) => {
      const summary = await importBackupFromText(text)
      await refresh()
      return summary
    },
    importList: async (placeId, plan, onProgress) => {
      const result = await applyImportPlan(placeId, plan, onProgress)
      await refresh()
      return result
    },
    assignCategories: async (itemIds, category, subcategory, mode) => {
      await assignCategory(itemIds, category, subcategory, mode)
      await refresh()
    },
    setModeFor: async (itemIds, mode) => {
      const changed = await setItemsMode(itemIds, mode)
      await refresh()
      return changed
    },
    uncategorizedItems: (placeId) => {
      const pending = items.filter((item) => item.needsCategory)
      if (!placeId) return pending
      const placeIds = subtreeIds(placeId, places)
      return pending.filter((item) => placeIds.has(item.placeId))
    },
    removeItems: async (itemIds) => {
      const removed = await deleteItems(itemIds)
      await refresh()
      return removed
    },
    mergeItemDuplicates: async (keepId, duplicateIds, mode) => {
      const result = await mergeDuplicates(keepId, duplicateIds, mode)
      await refresh()
      return result
    },
    itemToPlace: async (itemId, input) => {
      const place = await convertItemToPlace(itemId, input)
      await refresh()
      return place
    },
    removePlaceWithContents: async (placeId) => {
      await deletePlaceWithContents(placeId)
      await refresh()
    },
    removePlaces: async (placeIds) => {
      const result = await deletePlaces(placeIds)
      await refresh()
      return result
    },
    duplicateGroups: (placeId) => {
      if (!placeId) return findDuplicateGroups(visibleItems)
      const placeIds = subtreeIds(placeId, places)
      return findDuplicateGroups(items.filter((item) => placeIds.has(item.placeId)))
    },
    contentsOf: (placeId) => {
      const placeIds = subtreeIds(placeId, places)
      return {
        places: placeIds.size - 1,
        items: items.filter((item) => placeIds.has(item.placeId)).length,
      }
    },
  }
}

function subtreeIds(placeId: string, places: Place[]): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => {
    ids.add(id)
    for (const child of places.filter((place) => place.parentId === id)) {
      visit(child.id)
    }
  }
  visit(placeId)
  return ids
}
