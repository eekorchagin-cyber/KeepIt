/** Где текст на этикетке относительно QR-кода */
export type TextPlacement = 'right' | 'below'

export const TEXT_PLACEMENT_OPTIONS: Array<{ value: TextPlacement; label: string }> = [
  { value: 'right', label: 'Справа от QR' },
  { value: 'below', label: 'Под QR' },
]

export type PaperSize = 'A4' | 'A5'

export const PAPER: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
}

/** Лист с этикетками: формат бумаги, сетка, размер этикетки и промежутки (мм); поля — поровну по краям */
export type SheetLayout = {
  id: string
  label: string
  hint: string
  paper: PaperSize
  cols: number
  rows: number
  widthMm: number
  heightMm: number
  gapXMm: number
  gapYMm: number
  /** Пунктир по краям — для обычной бумаги, которую режут ножницами */
  cutLines: boolean
}

/** Типовые листы самоклеящихся этикеток A4 (Lomond, Avery, Office) и обычная бумага A4 и A5 */
export const SHEET_LAYOUTS: SheetLayout[] = [
  { id: 'plain-18', label: 'A4, обычная бумага: 18 на лист', hint: '3 × 6, 60 × 40 мм, разрезать по пунктиру', paper: 'A4', cols: 3, rows: 6, widthMm: 60, heightMm: 40, gapXMm: 5, gapYMm: 5, cutLines: true },
  { id: 'a5-plain-8', label: 'A5, обычная бумага: 8 на лист', hint: '2 × 4, 60 × 40 мм, разрезать по пунктиру', paper: 'A5', cols: 2, rows: 4, widthMm: 60, heightMm: 40, gapXMm: 5, gapYMm: 5, cutLines: true },
  { id: 'a5-plain-4', label: 'A5, обычная бумага: 4 крупные', hint: '2 × 2, 65 × 95 мм — для коробок и стеллажей, разрезать по пунктиру', paper: 'A5', cols: 2, rows: 2, widthMm: 65, heightMm: 95, gapXMm: 5, gapYMm: 5, cutLines: true },
  { id: 'a4-65', label: 'A4: 65 этикеток на листе', hint: '5 × 13, 38,1 × 21,2 мм', paper: 'A4', cols: 5, rows: 13, widthMm: 38.1, heightMm: 21.2, gapXMm: 2.5, gapYMm: 0, cutLines: false },
  { id: 'a4-40', label: 'A4: 40 этикеток на листе', hint: '4 × 10, 48,5 × 25,4 мм', paper: 'A4', cols: 4, rows: 10, widthMm: 48.5, heightMm: 25.4, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-24', label: 'A4: 24 этикетки на листе', hint: '3 × 8, 70 × 37 мм', paper: 'A4', cols: 3, rows: 8, widthMm: 70, heightMm: 37, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-21', label: 'A4: 21 этикетка на листе', hint: '3 × 7, 70 × 42,3 мм', paper: 'A4', cols: 3, rows: 7, widthMm: 70, heightMm: 42.3, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-16', label: 'A4: 16 этикеток на листе', hint: '2 × 8, 105 × 37 мм', paper: 'A4', cols: 2, rows: 8, widthMm: 105, heightMm: 37, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-14', label: 'A4: 14 этикеток на листе', hint: '2 × 7, 105 × 42,3 мм', paper: 'A4', cols: 2, rows: 7, widthMm: 105, heightMm: 42.3, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-12', label: 'A4: 12 этикеток на листе', hint: '2 × 6, 105 × 48 мм', paper: 'A4', cols: 2, rows: 6, widthMm: 105, heightMm: 48, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-8', label: 'A4: 8 этикеток на листе', hint: '2 × 4, 105 × 74 мм', paper: 'A4', cols: 2, rows: 4, widthMm: 105, heightMm: 74, gapXMm: 0, gapYMm: 0, cutLines: false },
  { id: 'a4-4', label: 'A4: 4 этикетки на листе', hint: '2 × 2, 105 × 148,5 мм', paper: 'A4', cols: 2, rows: 2, widthMm: 105, heightMm: 148.5, gapXMm: 0, gapYMm: 0, cutLines: false },
]

export const DEFAULT_SHEET_ID = 'plain-18'

export function findSheet(id: string | null | undefined): SheetLayout {
  return SHEET_LAYOUTS.find((layout) => layout.id === id) ?? SHEET_LAYOUTS[0]!
}

export function sheetPaper(layout: SheetLayout): { widthMm: number; heightMm: number } {
  return PAPER[layout.paper]
}

/** Этикетка на листе: номер метки и положение (мм от левого верхнего угла страницы) */
export type SheetCell = { index: number; x: number; y: number; w: number; h: number }

/** Раскладка меток по страницам листа — одна и та же для печати и для PDF */
export function sheetPages(layout: SheetLayout, count: number): SheetCell[][] {
  const perPage = layout.cols * layout.rows
  const paper = sheetPaper(layout)
  const left = (paper.widthMm - layout.cols * layout.widthMm - (layout.cols - 1) * layout.gapXMm) / 2
  const top = (paper.heightMm - layout.rows * layout.heightMm - (layout.rows - 1) * layout.gapYMm) / 2
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
