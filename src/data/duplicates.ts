import type { Item } from '../types'
import { normalizeName } from './listImport/parseList'

export type DuplicateGroup = {
  /** placeId + нормализованное название */
  key: string
  placeId: string
  items: Item[]
  /** Кого оставить по умолчанию */
  keeperId: string
}

function isLent(item: Item): boolean {
  return Boolean(item.lentTo?.trim())
}

/** Лучше оставить заполненную вещь с категорией. */
function keeperScore(item: Item): number {
  return (item.needsFill ? 0 : 2) + (item.category.trim() && !item.needsCategory ? 1 : 0)
}

/** Вещи с одинаковым названием в одном месте; переданные на время не учитываются. */
export function findDuplicateGroups(items: Item[]): DuplicateGroup[] {
  const byKey = new Map<string, Item[]>()
  for (const item of items) {
    if (isLent(item)) continue
    const name = normalizeName(item.name)
    if (!name) continue
    const key = `${item.placeId}|${name}`
    const list = byKey.get(key) ?? []
    list.push(item)
    byKey.set(key, list)
  }
  const groups: DuplicateGroup[] = []
  for (const [key, list] of byKey) {
    if (list.length < 2) continue
    const keeper = [...list].sort((a, b) => keeperScore(b) - keeperScore(a))[0]!
    groups.push({ key, placeId: list[0]!.placeId, items: list, keeperId: keeper.id })
  }
  return groups.sort((a, b) => a.items[0]!.name.localeCompare(b.items[0]!.name, 'ru'))
}
