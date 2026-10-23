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

export const LABEL_BRANDS = ['StickWell', 'Rillprint', 'Mega Label', 'Index Label', 'Apli'] as const
export type LabelBrand = (typeof LABEL_BRANDS)[number]

/**
 * Лист самоклеящихся этикеток A4 с прорезями (StickWell, Rillprint, Mega Label, Index Label, Apli).
 * Сетка — по данным производителей: поля симметричные (например, 38 × 21,2: по 10 мм по бокам и 10,7 мм
 * сверху), ряды идут с шагом pitchYMm (у 70 × 37 — 37,1 мм). Тот же размер — для A5 (половина листа).
 */
export type LabelFormat = {
  id: string
  cols: number
  /** Рядов на целом листе A4 */
  rowsA4: number
  widthMm: number
  heightMm: number
  /** Промежуток между колонками (у листов со скруглёнными этикетками — 2,5 мм) */
  gapXMm: number
  /** Шаг рядов, если больше высоты этикетки */
  pitchYMm?: number
  rounded?: boolean
  brands: LabelBrand[]
}

const ALL: LabelBrand[] = [...LABEL_BRANDS]

/** id прежних форматов сохранены — выбор пользователя переносится */
export const LABEL_FORMATS: LabelFormat[] = [
  { id: 'a4-65', cols: 5, rowsA4: 13, widthMm: 38, heightMm: 21.2, gapXMm: 0, brands: ['Rillprint', 'Mega Label', 'Index Label', 'Apli'] },
  { id: '48.5x16.9-64', cols: 4, rowsA4: 16, widthMm: 48.5, heightMm: 16.9, gapXMm: 0, brands: ['Mega Label', 'Apli'] },
  { id: '52.5x21.2-56', cols: 4, rowsA4: 14, widthMm: 52.5, heightMm: 21.2, gapXMm: 0, brands: ['Mega Label', 'Apli'] },
  { id: '70x16.9-51', cols: 3, rowsA4: 17, widthMm: 70, heightMm: 16.9, gapXMm: 0, brands: ['StickWell', 'Rillprint', 'Mega Label'] },
  { id: '48.5x25.4-44', cols: 4, rowsA4: 11, widthMm: 48.5, heightMm: 25.4, gapXMm: 0, brands: ['Rillprint', 'Index Label'] },
  { id: 'a4-40', cols: 4, rowsA4: 10, widthMm: 48.5, heightMm: 25.4, gapXMm: 0, brands: ['Mega Label', 'Index Label', 'Apli'] },
  { id: '52.5x29.7-40', cols: 4, rowsA4: 10, widthMm: 52.5, heightMm: 29.7, gapXMm: 0, brands: ['Rillprint', 'Mega Label', 'Apli'] },
  { id: '70x25.4-33', cols: 3, rowsA4: 11, widthMm: 70, heightMm: 25.4, gapXMm: 0, brands: ['StickWell', 'Mega Label', 'Apli'] },
  { id: '70x26-33', cols: 3, rowsA4: 11, widthMm: 70, heightMm: 26, gapXMm: 0, brands: ['Rillprint'] },
  { id: '70x29.7-30', cols: 3, rowsA4: 10, widthMm: 70, heightMm: 29.7, gapXMm: 0, brands: ['Mega Label', 'Apli'] },
  { id: '70x32-27', cols: 3, rowsA4: 9, widthMm: 70, heightMm: 32, gapXMm: 0, brands: ['Mega Label'] },
  { id: 'a4-24', cols: 3, rowsA4: 8, widthMm: 70, heightMm: 37, gapXMm: 0, pitchYMm: 37.1, brands: ALL },
  { id: '70x36-24', cols: 3, rowsA4: 8, widthMm: 70, heightMm: 36, gapXMm: 0, brands: ['StickWell', 'Mega Label'] },
  { id: '70x35-24', cols: 3, rowsA4: 8, widthMm: 70, heightMm: 35, gapXMm: 0, brands: ['StickWell', 'Rillprint', 'Mega Label', 'Apli'] },
  { id: '70x33.8-24', cols: 3, rowsA4: 8, widthMm: 70, heightMm: 33.8, gapXMm: 0, brands: ['StickWell', 'Mega Label'] },
  { id: '64.6x33.8-24', cols: 3, rowsA4: 8, widthMm: 64.6, heightMm: 33.8, gapXMm: 0, brands: ['StickWell', 'Rillprint', 'Mega Label', 'Apli'] },
  { id: 'a4-21', cols: 3, rowsA4: 7, widthMm: 70, heightMm: 42.4, gapXMm: 0, brands: ALL },
  { id: '70x38.1-21', cols: 3, rowsA4: 7, widthMm: 70, heightMm: 38.1, gapXMm: 0, brands: ['Rillprint'] },
  { id: '63.5x38.1-21', cols: 3, rowsA4: 7, widthMm: 63.5, heightMm: 38.1, gapXMm: 2.5, rounded: true, brands: ['Rillprint'] },
  { id: 'a4-18', cols: 3, rowsA4: 6, widthMm: 66.7, heightMm: 46, gapXMm: 0, brands: ['Mega Label'] },
  { id: '63.5x46.6-18', cols: 3, rowsA4: 6, widthMm: 63.5, heightMm: 46.6, gapXMm: 2.5, rounded: true, brands: ['StickWell'] },
  { id: 'a4-16', cols: 2, rowsA4: 8, widthMm: 105, heightMm: 37, gapXMm: 0, pitchYMm: 37.1, brands: ['StickWell', 'Rillprint', 'Index Label', 'Apli'] },
  { id: '105x35-16', cols: 2, rowsA4: 8, widthMm: 105, heightMm: 35, gapXMm: 0, brands: ['Rillprint', 'Apli'] },
  { id: '70x50.8-15', cols: 3, rowsA4: 5, widthMm: 70, heightMm: 50.8, gapXMm: 0, brands: ['Rillprint'] },
  { id: 'a4-14', cols: 2, rowsA4: 7, widthMm: 105, heightMm: 42.4, gapXMm: 0, pitchYMm: 42.43, brands: ['StickWell', 'Rillprint', 'Mega Label', 'Apli'] },
  { id: '99.1x38.1-14', cols: 2, rowsA4: 7, widthMm: 99.1, heightMm: 38.1, gapXMm: 2.5, rounded: true, brands: ['StickWell', 'Rillprint'] },
  { id: '90x42.3-14', cols: 2, rowsA4: 7, widthMm: 90, heightMm: 42.3, gapXMm: 0, brands: ['StickWell'] },
  { id: 'a4-12', cols: 2, rowsA4: 6, widthMm: 105, heightMm: 48, gapXMm: 0, brands: ['StickWell', 'Rillprint', 'Mega Label', 'Apli'] },
  { id: '70x67.7-12', cols: 3, rowsA4: 4, widthMm: 70, heightMm: 67.7, gapXMm: 0, brands: ['StickWell', 'Rillprint', 'Mega Label'] },
  { id: '105x57-10', cols: 2, rowsA4: 5, widthMm: 105, heightMm: 57, gapXMm: 0, brands: ['Rillprint', 'Mega Label', 'Index Label', 'Apli'] },
  { id: 'a4-8', cols: 2, rowsA4: 4, widthMm: 105, heightMm: 74, gapXMm: 0, pitchYMm: 74.25, brands: ['StickWell', 'Rillprint', 'Mega Label', 'Apli'] },
  { id: '105x70-8', cols: 2, rowsA4: 4, widthMm: 105, heightMm: 70, gapXMm: 0, brands: ['StickWell', 'Mega Label', 'Index Label'] },
  { id: '99.1x67.7-8', cols: 2, rowsA4: 4, widthMm: 99.1, heightMm: 67.7, gapXMm: 2.5, rounded: true, brands: ['Rillprint'] },
  { id: '105x99-6', cols: 2, rowsA4: 3, widthMm: 105, heightMm: 99, gapXMm: 0, brands: ['Mega Label'] },
  { id: 'a4-4', cols: 2, rowsA4: 2, widthMm: 105, heightMm: 148, gapXMm: 0, pitchYMm: 148.5, brands: ALL },
  { id: '210x148-2', cols: 1, rowsA4: 2, widthMm: 210, heightMm: 148, gapXMm: 0, pitchYMm: 148.5, brands: ['Rillprint', 'Mega Label', 'Index Label', 'Apli'] },
  { id: '210x297-1', cols: 1, rowsA4: 1, widthMm: 210, heightMm: 297, gapXMm: 0, brands: ALL },
]

export const DEFAULT_FORMAT_ID = 'a4-24'

export function findFormat(id: string | null | undefined): LabelFormat {
  return LABEL_FORMATS.find((format) => format.id === id) ?? LABEL_FORMATS.find((f) => f.id === DEFAULT_FORMAT_ID)!
}

export function labelsPerA4(format: LabelFormat): number {
  return format.cols * format.rowsA4
}

/** Сколько этикеток бывает на листе A4 — по убыванию */
export const LABEL_COUNTS: number[] = [...new Set(LABEL_FORMATS.map(labelsPerA4))].sort((a, b) => b - a)

export function formatsWithCount(count: number): LabelFormat[] {
  return LABEL_FORMATS.filter((format) => labelsPerA4(format) === count)
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
  const pitch = format.pitchYMm ?? format.heightMm
  const topMm = Math.max(0, (A4_PAGE.heightMm - (format.rowsA4 - 1) * pitch - format.heightMm) / 2)
  const rows =
    paper === 'A4'
      ? format.rowsA4
      : Math.max(0, Math.floor((A5_PAGE.heightMm - topMm - format.heightMm) / pitch + 1e-6) + 1)
  return {
    id: `${format.id}-${paper}${cutLines ? '-cut' : ''}`,
    format,
    paper,
    cols: format.cols,
    rows,
    widthMm: format.widthMm,
    heightMm: format.heightMm,
    gapXMm: format.gapXMm,
    gapYMm: pitch - format.heightMm,
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
  if (count === 0) return `Этикетка ${formatSize(layout.format)} на лист ${layout.paper} не помещается`
  return `${count} ${labelWord(count)} ${formatSize(layout.format)} на листе ${layout.paper} (${layout.cols} × ${layout.rows})`
}

/** «StickWell, Rillprint, Apli; скруглённые углы» */
export function formatBrands(format: LabelFormat): string {
  return `${format.brands.join(', ')}${format.rounded ? ' · скруглённые углы' : ''}`
}

export function sheetPaper(layout: SheetLayout): { widthMm: number; heightMm: number } {
  return layout.paper === 'A4' ? A4_PAGE : A5_PAGE
}

/** Этикетка на листе: номер метки и положение (мм от левого верхнего угла страницы) */
export type SheetCell = { index: number; x: number; y: number; w: number; h: number }

/** Раскладка меток по страницам листа — одна и та же для печати и для PDF */
export function sheetPages(layout: SheetLayout, count: number): SheetCell[][] {
  const perPage = layout.cols * layout.rows
  if (perPage === 0) return []
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
