import { db } from './db'
import { nowIso } from './ids'
import type { AppSettings, Item, Place, StockMove } from '../types'

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
  const [settings, places, items, moves] = await Promise.all([
    db.settings.get('settings'),
    db.places.toArray(),
    db.items.toArray(),
    db.moves.toArray(),
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

  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : nowIso(),
    settings: raw.settings as AppSettings,
    places: places as Place[],
    items: items as Item[],
    moves: moves as StockMove[],
  }
}

export async function parseBackupText(text: string): Promise<KeepItBackup> {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('Не удалось прочитать файл (ожидается JSON)')
  }
  return parseBackup(raw)
}

/** Полностью заменяет локальные данные содержимым бэкапа. */
export async function importBackup(backup: KeepItBackup): Promise<void> {
  const data = parseBackup(backup)
  await db.transaction('rw', db.settings, db.places, db.items, db.moves, async () => {
    await Promise.all([db.settings.clear(), db.places.clear(), db.items.clear(), db.moves.clear()])
    await db.settings.put(data.settings)
    if (data.places.length) await db.places.bulkPut(data.places)
    if (data.items.length) await db.items.bulkPut(data.items)
    if (data.moves.length) await db.moves.bulkPut(data.moves)
  })
}

export function backupFilename(exportedAt = nowIso()): string {
  const stamp = exportedAt.slice(0, 10).replaceAll('-', '')
  return `keepit-backup-${stamp || 'export'}.json`
}

/** Скачивает JSON (и при возможности предлагает системный Share). */
export async function downloadBackup(backup: KeepItBackup): Promise<void> {
  const text = `${JSON.stringify(backup, null, 2)}\n`
  const blob = new Blob([text], { type: 'application/json' })
  const filename = backupFilename(backup.exportedAt)
  const file = new File([blob], filename, { type: 'application/json' })

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'KeepIt' })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
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
    URL.revokeObjectURL(url)
  }
}

export async function exportBackup(): Promise<KeepItBackup> {
  const backup = await buildBackup()
  await downloadBackup(backup)
  return backup
}

export async function importBackupFromFile(file: File): Promise<void> {
  const text = await file.text()
  const backup = await parseBackupText(text)
  await importBackup(backup)
}
