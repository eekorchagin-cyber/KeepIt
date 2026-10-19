import type { AccountingMode } from '../types'

export const MODE_ICON: Record<AccountingMode, string> = {
  durable: './icons/mode-durable.png',
  consumable: './icons/mode-consumable.png',
}

export const MODE_LABEL: Record<AccountingMode, string> = {
  durable: 'Постоянное хранение',
  consumable: 'Расходный материал',
}

/** Варианты режима учёта для выбора в карточке вещи */
export const MODE_OPTIONS: Array<{ value: AccountingMode; label: string; hint: string }> = [
  { value: 'durable', label: MODE_LABEL.durable, hint: 'Инструменты, техника — учёт в штуках' },
  { value: 'consumable', label: MODE_LABEL.consumable, hint: 'Изолента, гвозди, краска — тратится, остаток меняется' },
]

export function categoryText(category: string, subcategory = ''): string {
  return [category, subcategory].filter(Boolean).join(' / ')
}
