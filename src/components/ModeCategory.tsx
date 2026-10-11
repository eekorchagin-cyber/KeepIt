import { MODE_ICON, MODE_LABEL, categoryText } from '../data/modes'
import type { AccountingMode } from '../types'

export function ModeCategory({
  mode,
  category,
  subcategory = '',
  suffix = '',
}: {
  mode: AccountingMode
  category: string
  subcategory?: string
  suffix?: string
}) {
  const text = categoryText(category, subcategory)
  return (
    <span className="mode-category" title={MODE_LABEL[mode]}>
      <img className="mode-icon" src={MODE_ICON[mode]} alt="" />
      {text ? <span>{text}</span> : null}
      {suffix ? <span>{suffix}</span> : null}
    </span>
  )
}
