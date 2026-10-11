import type { ObjectKey, Place } from '../types'

export type ObjectIconId = 'apartment' | 'home' | 'dacha' | 'work' | 'room' | 'shelf' | 'box'

export const OBJECT_ICON_OPTIONS: Array<{ id: ObjectIconId; src: string; label: string }> = [
  { id: 'apartment', src: './icons/apartment.png', label: 'Квартира' },
  { id: 'home', src: './icons/home.png', label: 'Дом' },
  { id: 'dacha', src: './icons/dacha.png', label: 'Дача' },
  { id: 'work', src: './icons/work.png', label: 'Работа' },
  { id: 'room', src: './icons/room.png', label: 'Комната' },
  { id: 'shelf', src: './icons/shelf.png', label: 'Стеллаж' },
  { id: 'box', src: './icons/box.png', label: 'Коробка' },
]

/** Палитра фона значка главного объекта. */
export const OBJECT_BG_OPTIONS = [
  '#C4A882',
  '#8B7355',
  '#6B8F71',
  '#5B7C99',
  '#B86B5A',
  '#7A6B8F',
  '#4A5568',
  '#D4A574',
  '#3D5A4C',
  '#2F4A6E',
]

const ICON_SRC: Record<ObjectIconId, string> = Object.fromEntries(
  OBJECT_ICON_OPTIONS.map((option) => [option.id, option.src]),
) as Record<ObjectIconId, string>

export function defaultObjectAppearance(objectKey: ObjectKey): { iconId: ObjectIconId; iconBg: string } {
  if (objectKey === 'home') return { iconId: 'apartment', iconBg: '#C4A882' }
  if (objectKey === 'dacha') return { iconId: 'dacha', iconBg: '#C4A882' }
  if (objectKey === 'work') return { iconId: 'work', iconBg: '#C4A882' }
  return { iconId: 'apartment', iconBg: '#5B7C99' }
}

export function resolveIconId(place: Place | undefined, objectKey?: ObjectKey): ObjectIconId {
  const key = place?.objectKey ?? objectKey ?? ''
  const raw = place?.iconId
  if (raw && raw in ICON_SRC) return raw as ObjectIconId
  return defaultObjectAppearance(key).iconId
}

export function resolveIconBg(place: Place | undefined, objectKey?: ObjectKey): string {
  const key = place?.objectKey ?? objectKey ?? ''
  if (place?.iconBg?.trim()) return place.iconBg
  return defaultObjectAppearance(key).iconBg
}

export function objectIconSrc(place: Place | undefined, objectKey?: ObjectKey): string {
  return ICON_SRC[resolveIconId(place, objectKey)]
}

export function objectLabelFromPlaces(objectKey: ObjectKey, places: Place[]): string {
  const root = places.find((place) => place.type === 'object' && place.objectKey === objectKey)
  if (root?.name) return root.name
  if (objectKey === 'home') return 'Квартира'
  if (objectKey === 'dacha') return 'Дача'
  if (objectKey === 'work') return 'Работа'
  return objectKey
}

export function rootObjects(places: Place[]): Place[] {
  return places
    .filter((place) => place.type === 'object' && !place.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/** Совместимость со старыми импортами. */
export const OBJECT_ICONS = {
  home: { src: ICON_SRC.apartment, label: 'Квартира' },
  dacha: { src: ICON_SRC.dacha, label: 'Дача' },
  work: { src: ICON_SRC.work, label: 'Работа' },
} as const
