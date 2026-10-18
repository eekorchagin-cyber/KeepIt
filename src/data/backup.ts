import { db } from './db'
import { nowIso } from './ids'
import type { AppSettings, Item, ItemName, Place, StockMove } from '../types'

export const BACKUP_APP = 'keepit'
export const BACKUP_FORMAT_VERSION = 1

export type KeepItBackup = {
  app: typeof BACKUP_APP
  formatVersion: number
  exportedAt: string
  settings: AppSettings
  places: Place[]
  items: Item[]
  moves: StockMove[]
  /** Справочник названий; в старых копиях отсутствует */
  itemNames?: ItemName[]
}

export type ImportSummary = {
  exportedAt: string
  places: number
  items: number
  moves: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`В файле нет списка «${label}»`)
  return value
}

/** Собирает полный снимок локальной БД. */
export async function buildBackup(): Promise<KeepItBackup> {
  const [settings, places, items, moves, itemNames] = await Promise.all([
    db.settings.get('settings'),
    db.places.toArray(),
    db.items.toArray(),
    db.moves.toArray(),
    db.itemNames.toArray(),
  ])
  if (!settings) throw new Error('Настройки не найдены')

  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: nowIso(),
    settings,
    places,
    items,
    moves,
    itemNames,
  }
}

/** Разбирает и проверяет JSON-бэкап. Не пишет в БД. */
export function parseBackup(raw: unknown): KeepItBackup {
  if (!isRecord(raw)) throw new Error('Файл повреждён или это не JSON')
  if (raw.app !== BACKUP_APP) throw new Error('Это не резервная копия KeepIt')
  if (raw.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Неподдерживаемая версия файла (${String(raw.formatVersion)})`)
  }
  if (!isRecord(raw.settings) || raw.settings.id !== 'settings') {
    throw new Error('В файле нет корректных настроек')
  }

  const places = assertArray(raw.places, 'places')
  const items = assertArray(raw.items, 'items')
  const moves = assertArray(raw.moves, 'moves')

  for (const place of places) {
    if (!isRecord(place) || typeof place.id !== 'string') {
      throw new Error('В файле повреждён список мест')
    }
  }
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string') {
      throw new Error('В файле повреждён список вещей')
    }
  }
  for (const move of moves) {
    if (!isRecord(move) || typeof move.id !== 'string') {
      throw new Error('В файле повреждён список движений')
    }
  }
  const itemNames = raw.itemNames === undefined ? [] : assertArray(raw.itemNames, 'itemNames')
  for (const entry of itemNames) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.nameKey !== 'string') {
      throw new Error('В файле повреждён справочник названий')
    }
  }

  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : nowIso(),
    settings: raw.settings as AppSettings,
    places: places as Place[],
    items: items as Item[],
    moves: moves as StockMove[],
    itemNames: itemNames as ItemName[],
  }
}

export function parseBackupText(text: string): KeepItBackup {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Error('Файл пустой — выберите JSON-копию KeepIt ещё раз')
  let raw: unknown
  try {
    raw = JSON.parse(trimmed) as unknown
  } catch {
    throw new Error('Не удалось прочитать файл (ожидается JSON)')
  }
  return parseBackup(raw)
}

/** Чтение файла до любых диалогов (иначе на iOS File часто становится пустым). */
export function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsText(file)
  })
}

/** Полностью заменяет локальные данные содержимым бэкапа. */
export async function importBackup(backup: KeepItBackup): Promise<ImportSummary> {
  const data = parseBackup(backup)
  const itemNames = data.itemNames ?? []
  await db.transaction('rw', [db.settings, db.places, db.items, db.moves, db.itemNames], async () => {
    await db.settings.clear()
    await db.places.clear()
    await db.items.clear()
    await db.moves.clear()
    await db.itemNames.clear()
    await db.settings.put(data.settings)
    if (data.places.length) await db.places.bulkPut(data.places)
    if (data.items.length) await db.items.bulkPut(data.items)
    if (data.moves.length) await db.moves.bulkPut(data.moves)
    if (itemNames.length) await db.itemNames.bulkPut(itemNames)
  })

  // Проверка, что запись реально попала в IndexedDB (на части WebView иначе тихий сбой).
  const [settings, placeCount, itemCount] = await Promise.all([
    db.settings.get('settings'),
    db.places.count(),
    db.items.count(),
  ])
  if (!settings || placeCount !== data.places.length || itemCount !== data.items.length) {
    throw new Error('Импорт не сохранился в память браузера. Попробуйте ещё раз в Safari/Chrome.')
  }

  return {
    exportedAt: data.exportedAt,
    places: data.places.length,
    items: data.items.length,
    moves: data.moves.length,
  }
}

export function backupFilename(exportedAt = nowIso()): string {
  const stamp = exportedAt.slice(0, 10).replaceAll('-', '')
  return `keepit-backup-${stamp || 'export'}.json`
}

/** Скачивает JSON. Share на мобильных — дополнительно, не вместо скачивания при отмене. */
export async function downloadBackup(backup: KeepItBackup): Promise<void> {
  const text = `${JSON.stringify(backup, null, 2)}\n`
  const blob = new Blob([text], { type: 'application/json' })
  const filename = backupFilename(backup.exportedAt)
  const file = new File([blob], filename, { type: 'application/json' })

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title: 'KeepIt', text: filename })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // иначе падаем на обычное скачивание
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export async function exportBackup(): Promise<KeepItBackup> {
  const backup = await buildBackup()
  await downloadBackup(backup)
  return backup
}

export async function importBackupFromText(text: string): Promise<ImportSummary> {
  const backup = parseBackupText(text)
  return importBackup(backup)
}

export async function importBackupFromFile(file: File): Promise<ImportSummary> {
  const text = await readFileAsText(file)
  return importBackupFromText(text)
}
