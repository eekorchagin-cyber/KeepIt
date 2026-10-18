import { useSyncExternalStore } from 'react'
import { isItemLent, isUnusedFreeLabel } from './repository'
import { newId, nowIso } from './ids'
import type { AccountingMode, Item, Place, UnitCode } from '../types'

/** Отметка по вещи: на месте, другое количество или не найдена */
export type InventoryMark = { status: 'ok' } | { status: 'qty'; quantity: number } | { status: 'missing' }

/** Вещь, найденная в месте, но записанная в другом месте (move) или не записанная нигде (new) */
export type FoundEntry =
  /** quantity — сколько нашлось здесь; меньше записанного — переносится часть, остаток проверяется на старом месте */
  | { id: string; kind: 'move'; placeId: string; itemId: string; quantity?: number }
  | { id: string; kind: 'new'; placeId: string; name: string; quantity: number; unit: UnitCode; mode: AccountingMode }

export type InventorySession = {
  /** Место, с которого начали: проверяется оно и всё внутри */
  rootId: string
  startedAt: string
  marks: Record<string, InventoryMark>
  /** Места, отмеченные «Место проверено» */
  checked: string[]
  found: FoundEntry[]
}

export type RouteStop = { place: Place; depth: number }

const STORAGE_KEY = 'keepit-inventory'
const listeners = new Set<() => void>()
let cached: InventorySession | null | undefined

function read(): InventorySession | null {
  if (cached !== undefined) return cached
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cached = raw ? (JSON.parse(raw) as InventorySession) : null
  } catch {
    cached = null
  }
  return cached
}

export function saveInventory(session: InventorySession | null) {
  cached = session
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // приватный режим — проверка живёт до закрытия программы
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Текущая (незавершённая) инвентаризация на этом устройстве — одна на все места */
export function useInventorySession(): InventorySession | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

export function startInventory(rootId: string): InventorySession {
  const session: InventorySession = { rootId, startedAt: nowIso(), marks: {}, checked: [], found: [] }
  saveInventory(session)
  return session
}

export function updateInventory(change: (session: InventorySession) => InventorySession) {
  const session = read()
  if (session) saveInventory(change(session))
}

type NewFound = FoundEntry extends infer Entry ? (Entry extends FoundEntry ? Omit<Entry, 'id'> : never) : never

export function addFound(session: InventorySession, entry: NewFound): InventorySession {
  return { ...session, found: [...session.found, { ...entry, id: newId() } as FoundEntry] }
}

/** Порядок обхода: место и все вложенные — сначала в глубину, по алфавиту; пустые заготовки меток пропускаются */
export function inventoryRoute(rootId: string, places: Place[]): RouteStop[] {
  const byParent = new Map<string, Place[]>()
  for (const place of places) {
    if (!place.parentId) continue
    const list = byParent.get(place.parentId) ?? []
    list.push(place)
    byParent.set(place.parentId, list)
  }
  const root = places.find((place) => place.id === rootId)
  if (!root) return []
  const route: RouteStop[] = []
  const visit = (place: Place, depth: number) => {
    route.push({ place, depth })
    const children = (byParent.get(place.id) ?? [])
      .filter((child) => !isUnusedFreeLabel(child))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    for (const child of children) visit(child, depth + 1)
  }
  visit(root, 0)
  return route
}

/** Сколько от записи вещи уже нашлось в других местах (без quantity — вся запись) */
export function movedQuantity(session: InventorySession, item: Item): number {
  return session.found.reduce(
    (sum, entry) => (entry.kind === 'move' && entry.itemId === item.id ? sum + (entry.quantity ?? item.quantity) : sum),
    0,
  )
}

/** Сколько должно остаться на записанном месте после найденного в других местах */
export function expectedQuantity(session: InventorySession, item: Item): number {
  return Math.max(0, item.quantity - movedQuantity(session, item))
}

/** Запись целиком нашлась в других местах — на старом месте её больше не проверяют */
export function isFullyMoved(session: InventorySession, item: Item): boolean {
  const moved = movedQuantity(session, item)
  return moved > 0 && moved >= item.quantity
}

/** Вещи, которые проверяются в месте: всё, что записано здесь, кроме переданных на время */
export function checkableItems(placeId: string, items: Item[]): Item[] {
  return items
    .filter((item) => item.placeId === placeId && !isItemLent(item))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export type InventorySummary = {
  totalPlaces: number
  checkedPlaces: number
  ok: Item[]
  /** expected — сколько ожидалось на месте (за вычетом нашедшегося в других местах), quantity — сколько нашли */
  changed: Array<{ item: Item; expected: number; quantity: number }>
  missing: Item[]
  /** quantity — сколько переносится; меньше записанного — часть */
  moved: Array<{ entry: FoundEntry & { kind: 'move' }; item: Item; quantity: number }>
  added: Array<FoundEntry & { kind: 'new' }>
}

export function summarizeInventory(session: InventorySession, route: RouteStop[], items: Item[]): InventorySummary {
  const routeIds = new Set(route.map((stop) => stop.place.id))
  const byId = new Map(items.map((item) => [item.id, item]))
  const summary: InventorySummary = {
    totalPlaces: route.length,
    checkedPlaces: session.checked.filter((id) => routeIds.has(id)).length,
    ok: [],
    changed: [],
    missing: [],
    moved: [],
    added: [],
  }
  for (const [itemId, mark] of Object.entries(session.marks)) {
    const item = byId.get(itemId)
    if (!item || !routeIds.has(item.placeId) || isFullyMoved(session, item)) continue
    // После переноса части в записи останется ровно expected — его и сверяем
    const expected = expectedQuantity(session, item)
    if (mark.status === 'missing') summary.missing.push(item)
    else if (mark.status === 'ok' || mark.quantity === expected) summary.ok.push(item)
    else summary.changed.push({ item, expected, quantity: mark.quantity })
  }
  for (const entry of session.found) {
    if (entry.kind === 'new') summary.added.push(entry)
    else {
      const item = byId.get(entry.itemId)
      if (item) summary.moved.push({ entry, item, quantity: Math.min(entry.quantity ?? item.quantity, item.quantity) })
    }
  }
  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, 'ru')
  summary.ok.sort(byName)
  summary.missing.sort(byName)
  summary.changed.sort((a, b) => byName(a.item, b.item))
  return summary
}
