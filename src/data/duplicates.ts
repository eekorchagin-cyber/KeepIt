import type { Item, Place } from '../types'
import { normalizeName } from './listImport/parseList'

export type DuplicateGroup = {
  /** нормализованное название + место оставляемой вещи */
  key: string
  /** Место вещи, которую оставим по умолчанию */
  placeId: string
  items: Item[]
  /** Кого оставить по умолчанию */
  keeperId: string
}

/** Подпись набора копий: если копий станет больше или меньше, группа снова считается дублями */
export function duplicateSignature(itemIds: string[]): string {
  return [...itemIds].sort().join(',')
}

const IGNORED_KEY = 'keepit-duplicates-kept'

/** Группы, которые пользователь решил оставить как разные вещи */
export function readKeptDuplicates(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function writeKeptDuplicates(keys: Set<string>) {
  try {
    localStorage.setItem(IGNORED_KEY, JSON.stringify([...keys]))
  } catch {
    // приватный режим — решение живёт до закрытия программы
  }
}

function isLent(item: Item): boolean {
  return Boolean(item.lentTo?.trim())
}

/** Лучше оставить заполненную вещь с категорией, лежащую в более точном (глубоком) месте. */
function keeperScore(item: Item, depth: number): number {
  return (item.needsFill ? 0 : 200) + (item.category.trim() && !item.needsCategory ? 100 : 0) + depth
}

/**
 * Дубли — вещи с одинаковым названием в одном месте или в месте и вложенном в него
 * (например, «Аэратор» на стеллаже и на полке этого стеллажа). Переданные на время не учитываются.
 */
export function findDuplicateGroups(items: Item[], places: Place[]): DuplicateGroup[] {
  const parentOf = new Map(places.map((place) => [place.id, place.parentId]))
  const ancestry = (placeId: string): string[] => {
    const chain: string[] = []
    let current: string | null | undefined = placeId
    while (current) {
      chain.push(current)
      current = parentOf.get(current) ?? null
    }
    return chain
  }
  const related = (a: string, b: string) => a === b || ancestry(a).includes(b) || ancestry(b).includes(a)

  const byName = new Map<string, Item[]>()
  for (const item of items) {
    if (isLent(item)) continue
    const name = normalizeName(item.name)
    if (!name) continue
    const list = byName.get(name) ?? []
    list.push(item)
    byName.set(name, list)
  }

  const groups: DuplicateGroup[] = []
  for (const [name, list] of byName) {
    if (list.length < 2) continue
    // Объединяем в кластеры вещи, чьи места совпадают или вложены одно в другое
    const clusters: Item[][] = []
    for (const item of list) {
      const joined = clusters.filter((cluster) => cluster.some((other) => related(other.placeId, item.placeId)))
      if (joined.length === 0) {
        clusters.push([item])
        continue
      }
      const merged = [...joined.flat(), item]
      for (const cluster of joined) clusters.splice(clusters.indexOf(cluster), 1)
      clusters.push(merged)
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue
      const keeper = [...cluster].sort(
        (a, b) => keeperScore(b, ancestry(b.placeId).length) - keeperScore(a, ancestry(a.placeId).length),
      )[0]!
      groups.push({ key: `${name}|${keeper.placeId}`, placeId: keeper.placeId, items: cluster, keeperId: keeper.id })
    }
  }
  return groups.sort((a, b) => a.items[0]!.name.localeCompare(b.items[0]!.name, 'ru'))
}
