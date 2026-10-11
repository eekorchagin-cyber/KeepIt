import type { AppSettings, Item, Place } from '../types'
import { defaultObjectAppearance } from './icons'
import { newId, nowIso } from './ids'
import { recomputePlaceCodes } from './placeCodes'

const PRESET_KEYS = ['home', 'dacha', 'work'] as const

const ROOMS: Record<(typeof PRESET_KEYS)[number], string[]> = {
  home: [
    'Коридор',
    'Кабинет',
    'Средняя комната',
    'Спальня',
    'Прачечная',
    'Ванная',
    'Зал',
    'Балкон',
    'Лоджия',
  ],
  dacha: ['Дом', 'Барбекю', 'Баня', 'Металлический гараж', 'Каменный гараж'],
  work: ['Кабинет', 'Комната отдыха'],
}

const OBJECT_NAMES: Record<(typeof PRESET_KEYS)[number], string> = {
  home: 'Квартира',
  dacha: 'Дача',
  work: 'Работа',
}

const DRAFT_ITEMS: Array<{
  name: string
  mode: Item['mode']
  category: string
  subcategory: string
}> = [
  { name: 'Разводной ключ', mode: 'durable', category: 'Инструменты', subcategory: 'Ручные' },
  { name: 'Набор гаечных ключей', mode: 'durable', category: 'Инструменты', subcategory: 'Наборы инструментов' },
  { name: 'Дрель', mode: 'durable', category: 'Инструменты', subcategory: 'Электрические' },
  { name: 'Шуруповёрт', mode: 'durable', category: 'Инструменты', subcategory: 'Электрические' },
  { name: 'Болгарка', mode: 'durable', category: 'Инструменты', subcategory: 'Электрические' },
  { name: 'Шлифовальная машина', mode: 'durable', category: 'Инструменты', subcategory: 'Электрические' },
  { name: 'Рубанок', mode: 'durable', category: 'Инструменты', subcategory: 'Требует уточнения' },
  { name: 'Электрический паяльник', mode: 'durable', category: 'Инструменты', subcategory: 'Электрические' },
  { name: 'Комплект инструментов электрика', mode: 'durable', category: 'Инструменты', subcategory: 'Наборы инструментов' },
  { name: 'Электрофен', mode: 'durable', category: 'Инструменты', subcategory: 'Электрические' },
  { name: 'Снегоуборочная машина', mode: 'durable', category: 'Оборудование', subcategory: 'Уборочная техника' },
  { name: 'Газонокосилка', mode: 'durable', category: 'Оборудование', subcategory: 'Садовая техника' },
  { name: 'Электролампочки', mode: 'consumable', category: 'Расходные материалы', subcategory: 'Освещение' },
  { name: 'Фильтры', mode: 'consumable', category: 'Расходные материалы', subcategory: 'Фильтры' },
  { name: 'Клей', mode: 'consumable', category: 'Расходные материалы', subcategory: 'Клеи' },
  { name: 'Термостойкий клей для печи', mode: 'consumable', category: 'Расходные материалы', subcategory: 'Клеи' },
  { name: 'Удобрение для газона', mode: 'consumable', category: 'Расходные материалы для сада', subcategory: 'Удобрения' },
  { name: 'Удобрение для растений', mode: 'consumable', category: 'Расходные материалы для сада', subcategory: 'Удобрения' },
  { name: 'Универсальное удобрение', mode: 'consumable', category: 'Расходные материалы для сада', subcategory: 'Удобрения' },
]

export function defaultSettings(familyId: string): AppSettings {
  return {
    id: 'settings',
    activeObject: 'dacha',
    theme: 'system',
    displayName: 'Глава семьи',
    familyId,
    familyName: 'Семья',
    role: 'admin',
    lastSyncAt: null,
    fontScale: 1.1,
  }
}

export function buildSeedPlaces(familyId: string): Place[] {
  const at = nowIso()
  const places: Place[] = []

  for (const objectKey of PRESET_KEYS) {
    const objectId = newId()
    const look = defaultObjectAppearance(objectKey)
    places.push({
      id: objectId,
      familyId,
      parentId: null,
      objectKey,
      name: OBJECT_NAMES[objectKey],
      type: 'object',
      code: OBJECT_NAMES[objectKey],
      note: '',
      iconId: look.iconId,
      iconBg: look.iconBg,
      archived: false,
      visibility: 'shared',
      version: 1,
      updatedAt: at,
      syncStatus: 'local',
    })

    for (const roomName of ROOMS[objectKey]) {
      places.push({
        id: newId(),
        familyId,
        parentId: objectId,
        objectKey,
        name: roomName,
        type: 'room',
        code: `${OBJECT_NAMES[objectKey]} / ${roomName}`,
        note: '',
        iconId: '',
        iconBg: '',
        archived: false,
        visibility: 'shared',
        version: 1,
        updatedAt: at,
        syncStatus: 'local',
      })
    }
  }

  return recomputePlaceCodes(places)
}

export function buildDraftItems(familyId: string, dachaPlaceId: string): Item[] {
  const at = nowIso()
  return DRAFT_ITEMS.map((draft) => ({
    id: newId(),
    familyId,
    placeId: dachaPlaceId,
    name: draft.name,
    mode: draft.mode,
    category: draft.category,
    subcategory: draft.subcategory,
    unit: draft.mode === 'consumable' ? 'pcs' : 'pcs',
    quantity: draft.mode === 'durable' ? 1 : 0,
    note: 'Требует заполнения',
    tags: [],
    needsFill: true,
    lentTo: '',
    lentAt: '',
    visibility: 'shared',
    version: 1,
    updatedAt: at,
    syncStatus: 'local' as const,
  }))
}

export { OBJECT_NAMES, ROOMS }
