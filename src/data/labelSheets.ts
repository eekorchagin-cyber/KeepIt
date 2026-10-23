/** Где текст на этикетке относительно QR-кода */
export type TextPlacement = 'right' | 'below'

export const TEXT_PLACEMENT_OPTIONS: Array<{ value: TextPlacement; label: string }> = [
  { value: 'right', label: 'Справа от QR' },
  { value: 'below', label: 'Под QR' },
]

export type PaperSize = 'A4' | 'A5'

export const PAPER_OPTIONS: Array<{ value: PaperSize; label: string; hint: string }> = [
  { value: 'A4', label: 'A4', hint: 'целый лист' },
  { value: 'A5', label: 'A5', hint: 'половина листа A4' },
]

const A4_PAGE = { widthMm: 210, heightMm: 297 }
/** A5 — половина листа A4, разрезанного поперёк: 210 × 148,5 мм, лежит горизонтально */
const A5_PAGE = { widthMm: 210, heightMm: 148.5 }

/**
 * Размер этикетки — как на стандартном самоклеящемся листе A4 с прорезями (Lomond, Avery, Office).
 * Один и тот же для A4 и A5: на A5 помещается верхняя половина сетки листа.
 */
export type LabelFormat = {
  id: string
  cols: number
  /** Рядов на целом листе A4 */
  rowsA4: number
  widthMm: number
  heightMm: number
  gapXMm: number
}

export const LABEL_FORMATS: LabelFormat[] = [
  { id: 'a4-65', cols: 5, rowsA4: 13, widthMm: 38.1, heightMm: 21.2, gapXMm: 2.5 },
  { id: 'a4-40', cols: 4, rowsA4: 10, widthMm: 48.5, heightMm: 25.4, gapXMm: 0 },
  { id: 'a4-24', cols: 3, rowsA4: 8, widthMm: 70, heightMm: 37, gapXMm: 0 },
  { id: 'a4-21', cols: 3, rowsA4: 7, widthMm: 70, heightMm: 42.3, gapXMm: 0 },
  { id: 'a4-16', cols: 2, rowsA4: 8, widthMm: 105, heightMm: 37, gapXMm: 0 },
  { id: 'a4-14', cols: 2, rowsA4: 7, widthMm: 105, heightMm: 42.3, gapXMm: 0 },
  { id: 'a4-12', cols: 2, rowsA4: 6, widthMm: 105, heightMm: 48, gapXMm: 0 },
  { id: 'a4-8', cols: 2, rowsA4: 4, widthMm: 105, heightMm: 74, gapXMm: 0 },
  { id: 'a4-4', cols: 2, rowsA4: 2, widthMm: 105, heightMm: 148.5, gapXMm: 0 },
]

export const DEFAULT_FORMAT_ID = 'a4-24'

export function findFormat(id: string | null | undefined): LabelFormat {
  return LABEL_FORMATS.find((format) => format.id === id) ?? LABEL_FORMATS.find((f) => f.id === DEFAULT_FORMAT_ID)!
}

/** Лист к печати: бумага, сетка и положение этикеток (мм) */
export type SheetLayout = {
  /** Набор для ключа подготовленной печати: формат, бумага, линии разреза */
  id: string
  format: LabelFormat
  paper: PaperSize
  cols: number
  rows: number
  widthMm: number
  heightMm: number
  gapXMm: number
  gapYMm: number
  /** Отступ сетки сверху — как у листа A4, чтобы этикетки попали в прорези */
  topMm: number
  /** Пунктир по краям меток — для бумаги без прорезей, которую режут ножницами */
  cutLines: boolean
}

/**
 * Лист выбранного формата на бумаге A4 или A5. На A5 — ряды верхней половины листа A4 (те же отступы);
 * нижнюю половину кладут линией разреза вниз, тогда её прорези совпадают.
 */
export function sheetLayout(format: LabelFormat, paper: PaperSize, cutLines: boolean): SheetLayout {
  const topMm = (A4_PAGE.heightMm - format.rowsA4 * format.heightMm) / 2
  const rows =
    paper === 'A4' ? format.rowsA4 : Math.floor((A5_PAGE.heightMm - topMm) / format.heightMm + 1e-6)
  return {
    id: `${format.id}-${paper}${cutLines ? '-cut' : ''}`,
    format,
    paper,
    cols: format.cols,
    rows,
    widthMm: format.widthMm,
    heightMm: format.heightMm,
    gapXMm: format.gapXMm,
    gapYMm: 0,
    topMm,
    cutLines,
  }
}

export function labelsPerSheet(layout: SheetLayout): number {
  return layout.cols * layout.rows
}

export function hasCutLines(layout: SheetLayout): boolean {
  return layout.cutLines
}

const mm = (value: number) => String(value).replace('.', ',')

export function labelWord(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return 'этикетка'
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'этикетки'
  return 'этикеток'
}

/** «70 × 37 мм» */
export function formatSize(format: LabelFormat): string {
  return `${mm(format.widthMm)} × ${mm(format.heightMm)} мм`
}

/** «12 этикеток 70 × 37 мм на листе A5 (3 × 4)» */
export function sheetLabel(layout: SheetLayout): string {
  const count = labelsPerSheet(layout)
  return `${count} ${labelWord(count)} ${formatSize(layout.format)} на листе ${layout.paper} (${layout.cols} × ${layout.rows})`
}

export function sheetPaper(layout: SheetLayout): { widthMm: number; heightMm: number } {
  return layout.paper === 'A4' ? A4_PAGE : A5_PAGE
}

/** Этикетка на листе: номер метки и положение (мм от левого верхнего угла страницы) */
export type SheetCell = { index: number; x: number; y: number; w: number; h: number }

/** Раскладка меток по страницам листа — одна и та же для печати и для PDF */
export function sheetPages(layout: SheetLayout, count: number): SheetCell[][] {
  const perPage = layout.cols * layout.rows
  const paper = sheetPaper(layout)
  const left = (paper.widthMm - layout.cols * layout.widthMm - (layout.cols - 1) * layout.gapXMm) / 2
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
        y: layout.topMm + row * (layout.heightMm + layout.gapYMm),
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
