/** Где текст на этикетке относительно QR-кода */
export type TextPlacement = 'right' | 'below'

export const TEXT_PLACEMENT_OPTIONS: Array<{ value: TextPlacement; label: string }> = [
  { value: 'right', label: 'Справа от QR' },
  { value: 'below', label: 'Под QR' },
]

export type PaperSize = 'A4' | 'A5'

export const PAPER_OPTIONS: Array<{ value: PaperSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'A5', label: 'A5' },
]

/**
 * labels — готовый лист этикеток A4; half — его половина (лист A4 разрезан поперёк, 210 × 148,5 мм);
 * plain — лист без разметки (обычная или сплошная самоклеящаяся бумага), метки режут по пунктиру.
 */
export type SheetKind = 'labels' | 'half' | 'plain'

export const SHEET_KIND_TITLE: Record<SheetKind, string> = {
  labels: 'Листы этикеток A4',
  half: 'Половина листа этикеток A4',
  plain: 'Без разметки — обычная или самоклеящаяся бумага, разрезать по пунктиру',
}

/** Лист с этикетками: формат, сетка, размер этикетки и промежутки (мм); поля по бокам — поровну */
export type SheetLayout = {
  id: string
  paper: PaperSize
  kind: SheetKind
  cols: number
  rows: number
  widthMm: number
  heightMm: number
  gapXMm: number
  gapYMm: number
  /**
   * Отступ сетки сверху (мм). Для половины листа — как у верхней половины A4; нижнюю половину кладут
   * линией разреза вниз — тогда сетка та же. Не задан — поровну сверху и снизу.
   */
  topMm?: number
}

const sheet = (layout: Omit<SheetLayout, 'gapXMm' | 'gapYMm'> & Partial<SheetLayout>): SheetLayout => ({
  gapXMm: 0,
  gapYMm: 0,
  ...layout,
})

/** Типовые листы самоклеящихся этикеток A4 (Lomond, Avery, Office), их половины и листы без разметки */
export const SHEET_LAYOUTS: SheetLayout[] = [
  sheet({ id: 'a4-65', paper: 'A4', kind: 'labels', cols: 5, rows: 13, widthMm: 38.1, heightMm: 21.2, gapXMm: 2.5 }),
  sheet({ id: 'a4-40', paper: 'A4', kind: 'labels', cols: 4, rows: 10, widthMm: 48.5, heightMm: 25.4 }),
  sheet({ id: 'a4-24', paper: 'A4', kind: 'labels', cols: 3, rows: 8, widthMm: 70, heightMm: 37 }),
  sheet({ id: 'a4-21', paper: 'A4', kind: 'labels', cols: 3, rows: 7, widthMm: 70, heightMm: 42.3 }),
  sheet({ id: 'a4-16', paper: 'A4', kind: 'labels', cols: 2, rows: 8, widthMm: 105, heightMm: 37 }),
  sheet({ id: 'a4-14', paper: 'A4', kind: 'labels', cols: 2, rows: 7, widthMm: 105, heightMm: 42.3 }),
  sheet({ id: 'a4-12', paper: 'A4', kind: 'labels', cols: 2, rows: 6, widthMm: 105, heightMm: 48 }),
  sheet({ id: 'a4-8', paper: 'A4', kind: 'labels', cols: 2, rows: 4, widthMm: 105, heightMm: 74 }),
  sheet({ id: 'a4-4', paper: 'A4', kind: 'labels', cols: 2, rows: 2, widthMm: 105, heightMm: 148.5 }),
  sheet({
    id: 'plain-18',
    paper: 'A4',
    kind: 'plain',
    cols: 3,
    rows: 6,
    widthMm: 60,
    heightMm: 40,
    gapXMm: 5,
    gapYMm: 5,
  }),
  // Половинки: только листы с чётным числом рядов — разрез ровно между рядами (148,5 мм)
  sheet({ id: 'a5-half-20', paper: 'A5', kind: 'half', cols: 4, rows: 5, widthMm: 48.5, heightMm: 25.4, topMm: 21.5 }),
  sheet({ id: 'a5-half-12', paper: 'A5', kind: 'half', cols: 3, rows: 4, widthMm: 70, heightMm: 37, topMm: 0.5 }),
  sheet({ id: 'a5-half-8', paper: 'A5', kind: 'half', cols: 2, rows: 4, widthMm: 105, heightMm: 37, topMm: 0.5 }),
  sheet({ id: 'a5-half-6', paper: 'A5', kind: 'half', cols: 2, rows: 3, widthMm: 105, heightMm: 48, topMm: 4.5 }),
  sheet({ id: 'a5-half-4', paper: 'A5', kind: 'half', cols: 2, rows: 2, widthMm: 105, heightMm: 74, topMm: 0.5 }),
  sheet({ id: 'a5-half-2', paper: 'A5', kind: 'half', cols: 2, rows: 1, widthMm: 105, heightMm: 148.5, topMm: 0 }),
  sheet({
    id: 'a5-plain-8',
    paper: 'A5',
    kind: 'plain',
    cols: 2,
    rows: 4,
    widthMm: 60,
    heightMm: 40,
    gapXMm: 5,
    gapYMm: 5,
  }),
  sheet({
    id: 'a5-plain-4',
    paper: 'A5',
    kind: 'plain',
    cols: 2,
    rows: 2,
    widthMm: 65,
    heightMm: 95,
    gapXMm: 5,
    gapYMm: 5,
  }),
]

export const DEFAULT_SHEET_ID = 'plain-18'
const DEFAULT_FOR_PAPER: Record<PaperSize, string> = { A4: 'plain-18', A5: 'a5-half-12' }

export function findSheet(id: string | null | undefined): SheetLayout {
  return (
    SHEET_LAYOUTS.find((layout) => layout.id === id) ?? SHEET_LAYOUTS.find((layout) => layout.id === DEFAULT_SHEET_ID)!
  )
}

/**
 * Раскладка для другого формата: лист этикеток A4 ↔ его половина (24 ↔ 12), без разметки ↔ без разметки;
 * если соответствия нет — стандартная для формата.
 */
export function sheetForPaper(current: SheetLayout, paper: PaperSize): SheetLayout {
  if (current.paper === paper) return current
  const count = labelsPerSheet(current)
  const match =
    current.kind === 'labels'
      ? SHEET_LAYOUTS.find((layout) => layout.kind === 'half' && labelsPerSheet(layout) * 2 === count)
      : current.kind === 'half'
        ? SHEET_LAYOUTS.find((layout) => layout.kind === 'labels' && labelsPerSheet(layout) === count * 2)
        : SHEET_LAYOUTS.find((layout) => layout.kind === 'plain' && layout.paper === paper)
  return match ?? findSheet(DEFAULT_FOR_PAPER[paper])
}

export function labelsPerSheet(layout: SheetLayout): number {
  return layout.cols * layout.rows
}

/** Пунктир по краям меток — для листов без разметки, которые режут ножницами */
export function hasCutLines(layout: SheetLayout): boolean {
  return layout.kind === 'plain'
}

const mm = (value: number) => String(value).replace('.', ',')

/** «24 этикетки на листе · 3 × 8, 70 × 37 мм» */
export function sheetLabel(layout: SheetLayout): string {
  const count = labelsPerSheet(layout)
  const word =
    count % 10 === 1 && count % 100 !== 11
      ? 'этикетка'
      : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)
        ? 'этикетки'
        : 'этикеток'
  const base = `${count} ${word} · ${layout.cols} × ${layout.rows}, ${mm(layout.widthMm)} × ${mm(layout.heightMm)} мм`
  if (layout.kind === 'half') return `${base} — половина листа A4 на ${count * 2}`
  if (layout.kind === 'plain') return `${base}, разрезать по пунктиру`
  return base
}

/** Размер страницы: половина A4 — 210 × 148,5 мм (лежит горизонтально) */
export function sheetPaper(layout: SheetLayout): { widthMm: number; heightMm: number } {
  if (layout.kind === 'half') return { widthMm: 210, heightMm: 148.5 }
  return layout.paper === 'A4' ? { widthMm: 210, heightMm: 297 } : { widthMm: 148, heightMm: 210 }
}

/** Этикетка на листе: номер метки и положение (мм от левого верхнего угла страницы) */
export type SheetCell = { index: number; x: number; y: number; w: number; h: number }

/** Раскладка меток по страницам листа — одна и та же для печати и для PDF */
export function sheetPages(layout: SheetLayout, count: number): SheetCell[][] {
  const perPage = layout.cols * layout.rows
  const paper = sheetPaper(layout)
  const left = (paper.widthMm - layout.cols * layout.widthMm - (layout.cols - 1) * layout.gapXMm) / 2
  const top = layout.topMm ?? (paper.heightMm - layout.rows * layout.heightMm - (layout.rows - 1) * layout.gapYMm) / 2
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
