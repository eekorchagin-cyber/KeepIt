import type { AccountingMode, PlaceType, UnitCode } from '../types'

/** Черновик экрана «Новая вещь» — чтобы пережить уход в Google на iPhone и возврат «← KeepIt». */
export type AddItemDraft = {
  placeId: string
  targetPlaceId: string
  pendingCode: string | null
  kind: 'item' | 'place'
  placeType: PlaceType
  name: string
  mode: AccountingMode
  category: string
  subcategory: string
  unit: UnitCode
  quantity: string
  note: string
  nameFromLookup: boolean
}

const DRAFT_KEY = 'keepit-add-item-draft'

export function readAddItemDraft(placeId: string): AddItemDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as AddItemDraft
    if (draft.placeId !== placeId) return null
    return draft
  } catch {
    return null
  }
}

export function writeAddItemDraft(draft: AddItemDraft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* private mode */
  }
}

export function clearAddItemDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
