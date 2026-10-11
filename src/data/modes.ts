import type { AccountingMode } from '../types'

export const MODE_ICON: Record<AccountingMode, string> = {
  durable: './icons/mode-durable.png',
  consumable: './icons/mode-consumable.png',
}

export const MODE_LABEL: Record<AccountingMode, string> = {
  durable: 'Постоянное хранение',
  consumable: 'Расходный материал',
}

export function categoryText(category: string, subcategory = ''): string {
  return [category, subcategory].filter(Boolean).join(' / ')
}
