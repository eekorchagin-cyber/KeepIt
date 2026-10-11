import type { UnitCode } from '../types'

export const UNIT_LABELS: Record<UnitCode, string> = {
  pcs: 'шт',
  kg: 'кг',
  pack: 'уп',
}

export const UNIT_OPTIONS: Array<{ value: UnitCode; label: string }> = [
  { value: 'pcs', label: 'шт' },
  { value: 'kg', label: 'кг' },
  { value: 'pack', label: 'уп' },
]

export function formatQty(quantity: number, unit: UnitCode): string {
  const rounded = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '')
  return `${rounded} ${UNIT_LABELS[unit]}`
}
