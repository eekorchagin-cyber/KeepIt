import type { Item } from '../types'
import { normalizeCategoryName } from './categories'

/** За сколько дней до срока ТО считается «скоро». */
export const SERVICE_SOON_DAYS = 14

export const SERVICE_INTERVALS = [0, 1, 3, 6, 12, 24] as const

export type ServiceStatus = 'overdue' | 'soon' | 'planned' | 'none'

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export function formatIsoDate(value: string | undefined): string {
  if (!isIsoDate(value)) return ''
  const [y, m, d] = value.split('-')
  return `${d}.${m}.${y}`
}

/** Дата + N месяцев; 31 января + 1 месяц → последний день февраля. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const target = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d, lastDay))
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

/** Сколько дней от сегодня до даты (отрицательно — просрочено). */
export function daysUntil(iso: string, today = todayIso()): number {
  const [y1, m1, d1] = today.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = iso.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Блок ТО показываем у оборудования и у любой вещи, где ТО уже заведено. */
export function tracksService(item: Item): boolean {
  return (
    normalizeCategoryName(item.category).startsWith('оборудование') ||
    isIsoDate(item.serviceLastAt) ||
    isIsoDate(item.serviceNextAt) ||
    (item.serviceIntervalMonths ?? 0) > 0
  )
}

export function serviceStatus(item: Item, today = todayIso()): ServiceStatus {
  if (!isIsoDate(item.serviceNextAt)) return 'none'
  const days = daysUntil(item.serviceNextAt, today)
  if (days < 0) return 'overdue'
  if (days <= SERVICE_SOON_DAYS) return 'soon'
  return 'planned'
}

export function serviceDueLabel(item: Item, today = todayIso()): string {
  if (!isIsoDate(item.serviceNextAt)) return ''
  const days = daysUntil(item.serviceNextAt, today)
  if (days < 0) return `просрочено на ${-days} дн.`
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} дн.`
}

export function intervalLabel(months: number): string {
  if (months <= 0) return 'вручную'
  if (months === 12) return 'раз в год'
  if (months === 24) return 'раз в 2 года'
  return `раз в ${months} мес.`
}

/** Вещи, которым пора на ТО (просрочено или в ближайшие дни), самые срочные сверху. */
export function dueServiceItems(items: Item[], today = todayIso()): Item[] {
  return items
    .filter((item) => {
      const status = serviceStatus(item, today)
      return status === 'overdue' || status === 'soon'
    })
    .sort((a, b) => (a.serviceNextAt ?? '').localeCompare(b.serviceNextAt ?? ''))
}
