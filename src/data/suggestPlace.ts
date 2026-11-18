import type { Item, Place } from '../types'
import { normalizeCategoryName } from './categories'
import { normalizeSearch } from './repository'

/** same — то же название; similar — одно название содержит другое; kind — та же категория */
export type StorageHintKind = 'same' | 'similar' | 'kind'

export type StorageHint = {
  placeId: string
  kind: StorageHintKind
  /** Сколько подходящих вещей лежит в этом месте */
  count: number
  /** До трёх названий для подписи */
  examples: string[]
}

type StorageItem = Pick<Item, 'name' | 'placeId' | 'category' | 'subcategory' | 'needsFill'>
type StoragePlace = Pick<Place, 'id' | 'parentId' | 'objectKey' | 'archived'>

type Bucket = {
  placeId: string
  count: number
  examples: string[]
}

function compactName(value: string): string {
  return normalizeSearch(value.replace(/\([^)]*\)/g, ' '))
}

/** Точное совпадение или вхождение названия (от 4 символов), как у похожих названий в импорте. */
function nameRelation(query: string, itemName: string): 'same' | 'similar' | null {
  if (!query || !itemName) return null
  if (query === itemName) return 'same'
  if (query.length < 4 || itemName.length < 4) return null
  if (query.includes(itemName) || itemName.includes(query)) return 'similar'
  return null
}

function depthOf(placeId: string, byId: Map<string, StoragePlace>): number {
  let depth = 0
  let current = byId.get(placeId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id)
    depth += 1
    const parent = byId.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return depth
}

/** Место и все предки не в архиве. */
function isLive(placeId: string, byId: Map<string, StoragePlace>): boolean {
  let current = byId.get(placeId)
  const seen = new Set<string>()
  if (!current) return false
  while (current && !seen.has(current.id)) {
    if (current.archived) return false
    seen.add(current.id)
    if (!current.parentId) return true
    const parent = byId.get(current.parentId)
    if (!parent) return true
    current = parent
  }
  return false
}

function touch(map: Map<string, Bucket>, placeId: string, displayName: string, key: string) {
  let bucket = map.get(placeId)
  if (!bucket) {
    bucket = { placeId, count: 0, examples: [] }
    map.set(placeId, bucket)
  }
  bucket.count += 1
  if (bucket.examples.length >= 3) return
  if (bucket.examples.some((name) => compactName(name) === key)) return
  const label = displayName.trim()
  if (label) bucket.examples.push(label)
}

function compareBuckets(
  a: Bucket,
  b: Bucket,
  hereObject: string | undefined,
  byId: Map<string, StoragePlace>,
): number {
  if (b.count !== a.count) return b.count - a.count
  if (hereObject) {
    const aHome = byId.get(a.placeId)?.objectKey === hereObject ? 1 : 0
    const bHome = byId.get(b.placeId)?.objectKey === hereObject ? 1 : 0
    if (aHome !== bHome) return bHome - aHome
  }
  const depthDelta = depthOf(b.placeId, byId) - depthOf(a.placeId, byId)
  if (depthDelta !== 0) return depthDelta
  return a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0
}

/** Места, где таких вещей строго больше, чем в текущем. При равенстве — до двух. */
function nameLeaders(
  buckets: Map<string, Bucket>,
  currentPlaceId: string,
  hereObject: string | undefined,
  byId: Map<string, StoragePlace>,
): Bucket[] {
  const here = buckets.get(currentPlaceId)?.count ?? 0
  const candidates = [...buckets.values()].filter((bucket) => bucket.placeId !== currentPlaceId && bucket.count > here)
  if (candidates.length === 0) return []
  candidates.sort((a, b) => compareBuckets(a, b, hereObject, byId))
  const bestCount = candidates[0]!.count
  const tied = candidates.filter((bucket) => bucket.count === bestCount)
  if (tied.length === 1) return tied
  const first = tied[0]!
  const second = tied[1]!
  const sameObject = byId.get(first.placeId)?.objectKey === byId.get(second.placeId)?.objectKey
  const sameDepth = depthOf(first.placeId, byId) === depthOf(second.placeId, byId)
  if (!sameObject || !sameDepth) return [first]
  return tied.slice(0, 2)
}

/**
 * Одно место-лидер. Ничья внутри одного объекта не выбирается:
 * категорию, размазанную по нескольким коробкам, некуда «прислонить».
 * Ничью между объектом, где пользователь сейчас, и другим объектом выигрывает свой.
 */
function kindLeader(
  buckets: Map<string, Bucket>,
  currentPlaceId: string,
  hereObject: string | undefined,
  byId: Map<string, StoragePlace>,
  subcategorySet: boolean,
): Bucket | null {
  const here = buckets.get(currentPlaceId)?.count ?? 0
  let candidates = [...buckets.values()].filter((bucket) => bucket.placeId !== currentPlaceId && bucket.count > here)
  if (!subcategorySet) candidates = candidates.filter((bucket) => bucket.count >= 2)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => compareBuckets(a, b, hereObject, byId))
  const bestCount = candidates[0]!.count
  const tied = candidates.filter((bucket) => bucket.count === bestCount)
  if (tied.length === 1) return tied[0]!
  if (!hereObject) return null
  const atHome = tied.filter((bucket) => byId.get(bucket.placeId)?.objectKey === hereObject)
  if (atHome.length === 1 && atHome.length < tied.length) return atHome[0]!
  return null
}

function toHint(bucket: Bucket, kind: StorageHintKind): StorageHint {
  return { placeId: bucket.placeId, kind, count: bucket.count, examples: bucket.examples }
}

/**
 * Куда положить новую вещь, чтобы похожее лежало рядом.
 * Предлагается место, где таких вещей уже больше, чем там, куда её собираются сохранить.
 * Сначала то же или похожее название, затем категория (подкатегория — даже по одной вещи,
 * категория без подкатегории — только если в месте их хотя бы две).
 */
export function suggestStoragePlaces(input: {
  name: string
  category: string
  subcategory: string
  currentPlaceId: string
  items: readonly StorageItem[]
  places: readonly StoragePlace[]
}): StorageHint[] {
  const nameKey = compactName(input.name)
  const categoryKey = normalizeCategoryName(input.category)
  const subKey = normalizeCategoryName(input.subcategory)
  if (!nameKey && !categoryKey) return []

  const byId = new Map(input.places.map((place) => [place.id, place]))
  const hereObject = byId.get(input.currentPlaceId)?.objectKey
  const same = new Map<string, Bucket>()
  const similar = new Map<string, Bucket>()
  const kind = new Map<string, Bucket>()

  for (const item of input.items) {
    if (item.needsFill) continue
    if (!isLive(item.placeId, byId)) continue
    const itemName = compactName(item.name)
    const relation = nameKey ? nameRelation(nameKey, itemName) : null
    if (relation === 'same') touch(same, item.placeId, item.name, itemName)
    else if (relation === 'similar') touch(similar, item.placeId, item.name, itemName)

    if (!categoryKey) continue
    const itemCategory = normalizeCategoryName(item.category)
    if (itemCategory !== categoryKey) continue
    if (subKey && normalizeCategoryName(item.subcategory) !== subKey) continue
    touch(kind, item.placeId, item.name, itemName)
  }

  const hints: StorageHint[] = []
  const named = nameLeaders(same, input.currentPlaceId, hereObject, byId)
  const namedHints =
    named.length > 0
      ? named.map((bucket) => toHint(bucket, 'same'))
      : nameLeaders(similar, input.currentPlaceId, hereObject, byId).map((bucket) => toHint(bucket, 'similar'))
  hints.push(...namedHints)

  if (hints.length < 2) {
    const categoryPlace = kindLeader(kind, input.currentPlaceId, hereObject, byId, Boolean(subKey))
    if (categoryPlace && !hints.some((hint) => hint.placeId === categoryPlace.placeId)) {
      hints.push(toHint(categoryPlace, 'kind'))
    }
  }

  return hints.slice(0, 2)
}
