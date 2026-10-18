import type { AccountingMode, ItemName, UnitCode } from '../types'
import { db } from './db'
import { newId, nowIso } from './ids'
import { normalizeName } from './listImport/parseList'

export type NameEntry = {
  name: string
  mode: AccountingMode
  unit: UnitCode
  /** undefined — категорию не трогаем (импорт); строка — запоминаем */
  category?: string
  subcategory?: string
}

export async function listItemNames(): Promise<ItemName[]> {
  const all = await db.itemNames.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function findName(names: ItemName[], name: string): ItemName | undefined {
  const key = normalizeName(name)
  return key ? names.find((entry) => entry.nameKey === key) : undefined
}

/**
 * Добавляет названия в справочник или обновляет существующие.
 * Можно вызывать внутри транзакции, включающей db.itemNames.
 */
export async function upsertNames(entries: NameEntry[]): Promise<void> {
  const byKey = new Map<string, NameEntry>()
  for (const entry of entries) {
    const key = normalizeName(entry.name)
    if (key) byKey.set(key, entry)
  }
  if (byKey.size === 0) return

  const keys = [...byKey.keys()]
  const existing = await db.itemNames.where('nameKey').anyOf(keys).toArray()
  const existingByKey = new Map(existing.map((entry) => [entry.nameKey, entry]))
  const at = nowIso()

  const rows: ItemName[] = keys.map((key) => {
    const entry = byKey.get(key)!
    const prev = existingByKey.get(key)
    const learn = entry.category !== undefined && entry.category.trim() !== ''
    if (prev) {
      return {
        ...prev,
        category: learn ? entry.category!.trim() : prev.category,
        subcategory: learn ? (entry.subcategory ?? '').trim() : prev.subcategory,
        mode: learn ? entry.mode : prev.mode,
        unit: learn ? entry.unit : prev.unit,
        usedCount: prev.usedCount + 1,
        updatedAt: at,
      }
    }
    return {
      id: newId(),
      nameKey: key,
      name: entry.name.trim(),
      category: learn ? entry.category!.trim() : '',
      subcategory: learn ? (entry.subcategory ?? '').trim() : '',
      mode: entry.mode,
      unit: entry.unit,
      usedCount: 1,
      updatedAt: at,
    }
  })
  await db.itemNames.bulkPut(rows)
}

/**
 * Убирает из справочника названия удалённых вещей, если категорию им не назначали
 * и других вещей с таким названием не осталось. Вызывать внутри транзакции с db.items и db.itemNames.
 */
export async function pruneUnusedNames(names: string[]): Promise<void> {
  const keys = [...new Set(names.map(normalizeName).filter(Boolean))]
  if (keys.length === 0) return
  const used = new Set((await db.items.toArray()).map((item) => normalizeName(item.name)))
  const stale = (await db.itemNames.where('nameKey').anyOf(keys).toArray()).filter(
    (entry) => !entry.category && !used.has(entry.nameKey),
  )
  if (stale.length) await db.itemNames.bulkDelete(stale.map((entry) => entry.id))
}

/** Запомнить назначенную категорию для названий (обучение подсказок). */
export async function learnCategory(entries: NameEntry[]): Promise<void> {
  await upsertNames(entries.filter((entry) => entry.category?.trim()))
}
