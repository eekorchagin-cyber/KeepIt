/** Ключ главного объекта хранения (home/dacha/work или пользовательский). */
export type ObjectKey = string

export type PlaceType =
  | 'object'
  | 'room'
  | 'cabinet'
  | 'shelf'
  | 'box'
  | 'container'
  | 'other'

export type AccountingMode = 'durable' | 'consumable'

export type UnitCode =
  | 'pcs'
  | 'set'
  | 'pair'
  | 'pack'
  | 'kg'
  | 'l'
  | 'm'
  | 'roll'
  | 'bag'
  | 'bottle'

export type MemberRole = 'admin' | 'member' | 'viewer'

export type ThemeMode = 'light' | 'dark' | 'system'

export type BadgeCount = 'quantity' | 'positions'

export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict'

export type Screen =
  | { name: 'home' }
  | { name: 'object'; objectKey: ObjectKey }
  | { name: 'place'; placeId: string }
  /** code — отсканированный незнакомый код: присвоить новой вещи или новому месту */
  | { name: 'add-item'; placeId: string; code?: string }
  | { name: 'import-list'; placeId: string }
  | { name: 'gather-items'; placeId: string }
  | { name: 'duplicates'; placeId?: string }
  /** Без view — список мест; stop — проверка места; scan — QR; report — итог */
  | { name: 'inventory'; placeId: string; view?: 'stop' | 'scan' | 'report'; stopId?: string }
  | { name: 'reminders' }
  | { name: 'categorize'; placeId?: string }
  | { name: 'item'; itemId: string }
  | { name: 'edit-item'; itemId: string }
  | { name: 'scan' }
  | { name: 'search' }
  | { name: 'print'; placeId?: string }
  | { name: 'lent' }
  | { name: 'categories' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'releases' }
  /** Присвоить отсканированный код вещи или месту */
  | { name: 'assign-code'; code: string }
  | { name: 'more' }

export type Place = {
  id: string
  familyId: string
  parentId: string | null
  objectKey: ObjectKey
  name: string
  type: PlaceType
  code: string
  note: string
  /** Рисунок значка (только для type === 'object'), например apartment */
  iconId: string
  /** Цвет фона значка (hex), только для главных объектов */
  iconBg: string
  archived: boolean
  /** Дата последней инвентаризации (YYYY-MM-DD); пусто — не проводилась */
  inventoriedAt?: string
  /** Присвоенные коды: свободные метки, чужие QR и штрихкоды (ключи scanKey) */
  extraCodes?: string[]
  visibility: 'shared' | 'personal'
  version: number
  updatedAt: string
  syncStatus: SyncStatus
}

export type Item = {
  id: string
  familyId: string
  placeId: string
  name: string
  mode: AccountingMode
  category: string
  subcategory: string
  unit: UnitCode
  quantity: number
  note: string
  tags: string[]
  needsFill: boolean
  /** Добавлена импортом списка, категория ещё не назначена */
  needsCategory: boolean
  /** Кому временно передана вещь; пусто — на месте хранения */
  lentTo: string
  /** Дата передачи (YYYY-MM-DD); пусто если не передана */
  lentAt: string
  /** Последнее техническое обслуживание (YYYY-MM-DD); пусто — не проводилось или неизвестно */
  serviceLastAt?: string
  /** Следующее ТО (YYYY-MM-DD); по нему строятся напоминания */
  serviceNextAt?: string
  /** Интервал ТО в месяцах; 0 — следующая дата задаётся вручную */
  serviceIntervalMonths?: number
  /** Присвоенные коды: свободные метки, чужие QR и штрихкоды (ключи scanKey) */
  extraCodes?: string[]
  visibility: 'shared' | 'personal'
  version: number
  updatedAt: string
  syncStatus: SyncStatus
}

export type StockMove = {
  id: string
  familyId: string
  itemId: string
  kind: 'in' | 'out' | 'adjust'
  quantity: number
  unit: UnitCode
  placeId: string
  note: string
  authorName: string
  createdAt: string
  syncStatus: SyncStatus
}

/** Справочник названий вещей: для автоподстановки и подсказки категории. */
export type ItemName = {
  id: string
  /** Название в нижнем регистре, ё → е, без лишних пробелов */
  nameKey: string
  name: string
  /** Пусто, пока категорию ни разу не назначали */
  category: string
  subcategory: string
  mode: AccountingMode
  unit: UnitCode
  usedCount: number
  updatedAt: string
}

export type CategoryNode = {
  name: string
  children: string[]
}

export type AppSettings = {
  id: 'settings'
  activeObject: ObjectKey
  theme: ThemeMode
  displayName: string
  familyId: string
  familyName: string
  role: MemberRole
  lastSyncAt: string | null
  fontScale: number
  /** Что показывать на бейджах мест: сумму количества (гвоздей) или число позиций (упаковок, записей) */
  badgeCount?: BadgeCount
  /** Редактируемый справочник категорий */
  categories: CategoryNode[]
}

export type InviteRecord = {
  code: string
  familyId: string
  createdAt: string
}
