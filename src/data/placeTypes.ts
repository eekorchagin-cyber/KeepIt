import type { PlaceType } from '../types'

export const PLACE_TYPES: Array<{ value: PlaceType; label: string; hint: string }> = [
  { value: 'room', label: 'Помещение', hint: 'Комната, гараж, баня — в объекте или в другом помещении (кухня в квартире)' },
  { value: 'cabinet', label: 'Шкаф / стеллаж', hint: 'В помещении; внутри — полки, коробки' },
  { value: 'shelf', label: 'Полка / ящик', hint: 'В шкафу, стеллаже или помещении' },
  { value: 'box', label: 'Коробка', hint: 'Куда угодно, можно коробку в коробку' },
  { value: 'container', label: 'Контейнер', hint: 'Куда угодно' },
  { value: 'other', label: 'Другое', hint: 'Куда угодно' },
]

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  object: 'Объект',
  room: 'Помещение',
  cabinet: 'Шкаф / стеллаж',
  shelf: 'Полка / ящик',
  box: 'Коробка',
  container: 'Контейнер',
  other: 'Другое',
}

/** Одно слово рядом со значком на экране места */
export const PLACE_TYPE_SHORT: Record<PlaceType, string> = {
  object: 'Объект',
  room: 'Помещение',
  cabinet: 'Стеллаж',
  shelf: 'Полка',
  box: 'Коробка',
  container: 'Контейнер',
  other: 'Другое',
}

/** Уровень «каркаса»: помещение → шкаф/стеллаж → полка. Коробки, контейнеры и «другое» — вне уровней */
const LEVEL: Partial<Record<PlaceType, number>> = { object: 0, room: 1, cabinet: 2, shelf: 3 }

/**
 * Можно ли положить место типа child внутрь места типа parent.
 * Помещение — в объект или в другое помещение (кухня в квартире); полка не в полку, стеллаж не в стеллаж;
 * остальной каркас — только в более крупный (полка — в шкаф, стеллаж или помещение; не в коробку).
 * Коробки и контейнеры — куда угодно.
 */
export function canNest(parentType: PlaceType, childType: PlaceType): boolean {
  if (childType === 'object') return false
  if (childType === 'room') return parentType === 'object' || parentType === 'room'
  const childLevel = LEVEL[childType]
  if (childLevel === undefined) return true
  const parentLevel = LEVEL[parentType]
  return parentLevel !== undefined && parentLevel < childLevel
}

/** Понятное объяснение, почему нельзя, и куда можно */
export function nestError(parentType: PlaceType, childType: PlaceType): string {
  const allowed =
    childType === 'room'
      ? 'в объект или в другое помещение'
      : childType === 'cabinet'
        ? 'в помещение или объект'
        : 'в шкаф / стеллаж, помещение или объект'
  return (
    `Место типа «${PLACE_TYPE_LABEL[childType]}» нельзя положить в «${PLACE_TYPE_LABEL[parentType]}»: ` +
    `его можно положить ${allowed}. Измените тип места или выберите другое место.`
  )
}
