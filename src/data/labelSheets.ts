/** Где текст на этикетке относительно QR-кода */
export type TextPlacement = 'right' | 'below'

export const TEXT_PLACEMENT_OPTIONS: Array<{ value: TextPlacement; label: string }> = [
  { value: 'right', label: 'Справа от QR' },
  { value: 'below', label: 'Под QR' },
]

/** Лист A4 с этикетками: сетка, размер этикетки и промежутки (мм); поля — поровну по краям */
export type SheetLayout = {
  id: string
  label: string
  hint: string
  cols: number
  rows: number
  widthMm: number
  heightMm: number
  gapXMm: number
  gapYMm: number
  /** Пунктир по краям — для обычной бумаги, которую режут ножницами */
  cutLines: boolean
}

export const A4 = { widthMm: 210, heightMm: 297 }

/** Типовые листы самоклеящихся этикеток A4 (Lomond, Avery, Office) и обычная бумага */
export const A4_LAYOUTS: SheetLayout[] = [
  { id: 'plain-18', label: 'Обычная бумага: 18 на лист', hint: '3 × 6, 60 × 40 мм, разрезать по пунктиру', cols: 3, rows: 6, widthMm: 60, heightMm: 40, gapXMm: 5, gapYMm: 5, cutLines: true },
  { id: 'a4-65', label: '65 этикеток на листе', hint: '5 × 13, 38,1 × 21,2 мм', cols: 5, rows: 13, widthMm: 38.1, heightMm: 21.2, gapXMm: 2.5, gapYMm: 0, cutLines: false },
  { id: 'a4-40', label: '40 этикеток на листе', hint: '4 × 10, 48,5 × 25,4 мм', cols: 4, rows: 10, widthMm: 48.5, heightMm: 25.4, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-24', label: '24 этикетки на листе', hint: '3 × 8, 70 × 37 мм', cols: 3, rows: 8, widthMm: 70, heightMm: 37, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-21', label: '21 этикетка на листе', hint: '3 × 7, 70 × 42,3 мм', cols: 3, rows: 7, widthMm: 70, heightMm: 42.3, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-16', label: '16 этикеток на листе', hint: '2 × 8, 105 × 37 мм', cols: 2, rows: 8, widthMm: 105, heightMm: 37, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-14', label: '14 этикеток на листе', hint: '2 × 7, 105 × 42,3 мм', cols: 2, rows: 7, widthMm: 105, heightMm: 42.3, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-12', label: '12 этикеток на листе', hint: '2 × 6, 105 × 48 мм', cols: 2, rows: 6, widthMm: 105, heightMm: 48, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-8', label: '8 этикеток на листе', hint: '2 × 4, 105 × 74 мм', cols: 2, rows: 4, widthMm: 105, heightMm: 74, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-4', label: '4 этикетки на листе', hint: '2 × 2, 105 × 148,5 мм', cols: 2, rows: 2, widthMm: 105, heightMm: 148.5, gapXMm: 0, gapYMm: 0, cutLines: false },
]

export const DEFAULT_SHEET_ID = 'plain-18'

export function findSheet(id: string | null | undefined): SheetLayout {
  return A4_LAYOUTS.find((layout) => layout.id === id) ?? A4_LAYOUTS[0]!
}

/** Этикетка на листе: номер метки и положение (мм от левого верхнего угла страницы) */
export type SheetCell = { index: number; x: number; y: number; w: number; h: number }

/** Раскладка меток по страницам листа — одна и та же для печати и для PDF */
export function sheetPages(layout: SheetLayout, count: number): SheetCell[][] {
  const perPage = layout.cols * layout.rows
  const left = (A4.widthMm - layout.cols * layout.widthMm - (layout.cols - 1) * layout.gapXMm) / 2
  const top = (A4.heightMm - layout.rows * layout.heightMm - (layout.rows - 1) * layout.gapYMm) / 2
  const pages: SheetCell[][] = []
  for (let start = 0; start < count; start += perPage) {
    const cells: SheetCell[] = []
    for (let index = start; index < Math.min(count, start + perPage); index += 1) {
      const cell = index - start
      const column = cell % layout.cols
      const row = Math.floor(cell / layout.cols)
      cells.push({
        index,
        x: left + column * (layout.widthMm + layout.gapXMm),
        y: top + row * (layout.heightMm + layout.gapYMm),
        w: layout.widthMm,
        h: layout.heightMm,
      })
    }
    pages.push(cells)
  }
  return pages
}

/** Лента 62 мм (Brother QL): каждая метка — своя этикетка 62 × 40 мм */
export const TAPE_LABEL = { widthMm: 62, heightMm: 40 }
