import type { PlaceType } from '../types'

export const PLACE_TYPES: Array<{ value: PlaceType; label: string }> = [
  { value: 'room', label: 'Помещение' },
  { value: 'cabinet', label: 'Шкаф / стеллаж' },
  { value: 'shelf', label: 'Полка / ящик' },
  { value: 'box', label: 'Коробка' },
  { value: 'container', label: 'Контейнер' },
  { value: 'other', label: 'Другое' },
]
