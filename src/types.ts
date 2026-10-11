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

export type UnitCode = 'pcs' | 'kg' | 'pack'

export type MemberRole = 'admin' | 'member' | 'viewer'

export type ThemeMode = 'light' | 'dark' | 'system'

export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict'

export type Screen =
  | { name: 'home' }
  | { name: 'object'; objectKey: ObjectKey }
  | { name: 'place'; placeId: string }
  | { name: 'add-item'; placeId: string }
  | { name: 'item'; itemId: string }
  | { name: 'edit-item'; itemId: string }
  | { name: 'scan' }
  | { name: 'search' }
  | { name: 'print'; placeId?: string }
  | { name: 'lent' }
  | { name: 'categories' }
  | { name: 'settings' }
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
  /** Кому временно передана вещь; пусто — на месте хранения */
  lentTo: string
  /** Дата передачи (YYYY-MM-DD); пусто если не передана */
  lentAt: string
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
  /** Редактируемый справочник категорий */
  categories: CategoryNode[]
}

export type InviteRecord = {
  code: string
  familyId: string
  createdAt: string
}
