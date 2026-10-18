import type { AccountingMode, UnitCode } from '../types'

export const UNIT_LABELS: Record<UnitCode, string> = {
  pcs: 'шт.',
  set: 'компл.',
  pair: 'пар',
  pack: 'уп.',
  kg: 'кг',
  l: 'л',
  m: 'м',
  roll: 'рул.',
  bag: 'меш.',
  bottle: 'бут.',
}

export const UNIT_OPTIONS: Array<{ value: UnitCode; label: string }> = (
  Object.keys(UNIT_LABELS) as UnitCode[]
).map((value) => ({ value, label: UNIT_LABELS[value] }))

/** Штучные единицы: допустимы для постоянного хранения, количество целое. */
export const DURABLE_UNITS: UnitCode[] = ['pcs', 'set', 'pair']

export function isCountableUnit(unit: UnitCode): boolean {
  return DURABLE_UNITS.includes(unit)
}

export function unitOptionsFor(mode: AccountingMode): Array<{ value: UnitCode; label: string }> {
  return mode === 'durable'
    ? UNIT_OPTIONS.filter((option) => isCountableUnit(option.value))
    : UNIT_OPTIONS
}

/** Для постоянного хранения нештучная единица заменяется на «шт.». */
export function unitForMode(mode: AccountingMode, unit: UnitCode): UnitCode {
  return mode === 'durable' && !isCountableUnit(unit) ? 'pcs' : unit
}

export function formatQty(quantity: number, unit: UnitCode): string {
  const rounded = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '')
  return `${rounded} ${UNIT_LABELS[unit] ?? unit}`
}
