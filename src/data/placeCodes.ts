import type { Place } from '../types'

/** Читаемый код места — полный путь по иерархии. */
export function formatPlacePathCode(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ')
}

export function normalizePlaceCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
}

export function placePathNames(placeId: string, places: Place[]): string[] {
  const map = new Map(places.map((place) => [place.id, place]))
  const names: string[] = []
  let current = map.get(placeId)
  while (current) {
    names.unshift(current.name)
    current = current.parentId ? map.get(current.parentId) : undefined
  }
  return names
}

export function codeForPlace(placeId: string, places: Place[]): string {
  return formatPlacePathCode(placePathNames(placeId, places))
}

export function recomputePlaceCodes(places: Place[]): Place[] {
  return places.map((place) => ({
    ...place,
    code: codeForPlace(place.id, places),
  }))
}

export function placeUrl(placeId: string): string {
  const base =
    typeof location !== 'undefined'
      ? `${location.origin}${location.pathname.replace(/\/$/, '')}`
      : ''
  return `${base}#/place/${placeId}`
}

/** Ссылка из QR-метки вещи: сканер открывает её карточку */
export function itemUrl(itemId: string): string {
  const base =
    typeof location !== 'undefined'
      ? `${location.origin}${location.pathname.replace(/\/$/, '')}`
      : ''
  return `${base}#/item/${itemId}`
}

/** Код вещи из отсканированного QR (только метки вещей — ссылка с «#/item/…») */
export function parseItemIdFromScan(raw: string): string | null {
  const match = raw.trim().match(/#\/item\/([0-9a-f-]{36})/i)
  return match?.[1] ?? null
}

/**
 * Ключ отсканированного кода для «Присвоить код»: метка места — «place:<id>», метка вещи — «item:<id>»,
 * любой другой QR или штрихкод — сам его текст.
 */
export function scanKey(raw: string): string {
  const value = raw.trim()
  const itemId = parseItemIdFromScan(value)
  if (itemId) return `item:${itemId.toLowerCase()}`
  const placeId = value.match(/#\/place\/([0-9a-f-]{36})/i)?.[1]
  if (placeId) return `place:${placeId.toLowerCase()}`
  return value
}

function hasCode(entry: { extraCodes?: string[] }, key: string): boolean {
  return Boolean(key && entry.extraCodes?.includes(key))
}

/** Вещь по её метке или по присвоенному ей коду */
export function findItemByScan<T extends { id: string; extraCodes?: string[] }>(raw: string, items: T[]): T | null {
  const itemId = parseItemIdFromScan(raw)
  const own = itemId ? items.find((item) => item.id === itemId) : undefined
  if (own) return own
  const key = scanKey(raw)
  return items.find((item) => hasCode(item, key)) ?? null
}

/** Место по его метке, коду-пути или по присвоенному ему коду */
export function parsePlaceFromScan(raw: string, places: Place[]): Place | null {
  const own = ownPlaceFromScan(raw, places)
  if (own) return own
  const key = scanKey(raw)
  return places.find((place) => hasCode(place, key)) ?? null
}

function ownPlaceFromScan(raw: string, places: Place[]): Place | null {
  // Метка вещи — не место (иначе UUID вещи искался бы среди мест)
  if (parseItemIdFromScan(raw)) return null
  const value = raw.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    const hash = url.hash.replace(/^#/, '')
    const match = hash.match(/\/place\/([0-9a-f-]{36})/i)
    if (match?.[1]) {
      return places.find((place) => place.id === match[1]) ?? null
    }
  } catch {
    /* not a URL */
  }

  const hashMatch = value.match(/#\/place\/([0-9a-f-]{36})/i)
  if (hashMatch?.[1]) {
    return places.find((place) => place.id === hashMatch[1]) ?? null
  }

  const uuidMatch = value.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )
  if (uuidMatch?.[0]) {
    return places.find((place) => place.id === uuidMatch[0]) ?? null
  }

  const code = normalizePlaceCode(value)
  return places.find((place) => normalizePlaceCode(place.code) === code) ?? null
}

export function looksLikeLegacyShortCode(code: string): boolean {
  return /^M-[A-Z0-9]{5}$/i.test(code.trim())
}
