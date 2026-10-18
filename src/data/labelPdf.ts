import { renderLabelJpeg } from './labelImage'
import type { PrinterMethod } from './printers'

const PT_PER_MM = 72 / 25.4
/** ≈300 dpi — чёткий QR и текст при печати из PDF */
const DOTS_PER_MM = 12

const TAPE = { widthMm: 62, heightMm: 40 }
const A4 = { widthMm: 210, heightMm: 297, marginMm: 10, gapMm: 5, columns: 3, rows: 6 }
const A4_LABEL = { widthMm: (210 - 2 * 10 - 2 * 5) / 3, heightMm: 40 }

type JpegImage = { bytes: Uint8Array; width: number; height: number }
/** Положение метки на странице, мм от левого верхнего угла */
type Placement = { image: number; x: number; y: number; w: number; h: number }
type Page = { widthMm: number; heightMm: number; items: Placement[]; cutLines: boolean }

const pt = (mm: number) => (mm * PT_PER_MM).toFixed(2)

/** Минимальный PDF 1.4: страницы с JPEG-картинками (DCTDecode) и пунктиром для разрезания. */
function buildPdf(images: JpegImage[], pages: Page[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  const begin = (id: number) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
  }

  const imageId = (index: number) => 3 + index
  const contentId = (index: number) => 3 + images.length + index * 2
  const pageId = (index: number) => contentId(index) + 1
  const total = 3 + images.length + pages.length * 2

  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')
  begin(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  begin(2)
  push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`)

  images.forEach((image, index) => {
    begin(imageId(index))
    push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
    )
    push(image.bytes)
    push('\nendstream\nendobj\n')
  })

  pages.forEach((page, index) => {
    const ops: string[] = []
    for (const item of page.items) {
      const bottom = page.heightMm - item.y - item.h
      ops.push(`q ${pt(item.w)} 0 0 ${pt(item.h)} ${pt(item.x)} ${pt(bottom)} cm /Im${item.image} Do Q`)
      if (page.cutLines) {
        ops.push(`q 0.6 G 0.5 w [3 3] 0 d ${pt(item.x)} ${pt(bottom)} ${pt(item.w)} ${pt(item.h)} re S Q`)
      }
    }
    const content = encoder.encode(ops.join('\n'))
    begin(contentId(index))
    push(`<< /Length ${content.length} >>\nstream\n`)
    push(content)
    push('\nendstream\nendobj\n')

    const used = [...new Set(page.items.map((item) => item.image))]
    begin(pageId(index))
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(page.widthMm)} ${pt(page.heightMm)}] ` +
        `/Resources << /XObject << ${used.map((image) => `/Im${image} ${imageId(image)} 0 R`).join(' ')} >> >> ` +
        `/Contents ${contentId(index)} 0 R >>\nendobj\n`,
    )
  })

  const xrefOffset = length
  push(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let id = 1; id < total; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/**
 * PDF с метками в раскладке выбранного AirPrint-принтера:
 * лента — каждая метка на своей странице 62×40 мм, A4 — по 3 в ряд с пунктиром для разрезания.
 */
export async function renderLabelsPdf(
  labels: Array<{ name: string; url: string }>,
  method: Exclude<PrinterMethod, 'image'>,
): Promise<Blob> {
  const labelSize = method === 'airprint-tape' ? TAPE : A4_LABEL
  const images = await Promise.all(
    labels.map((label) => renderLabelJpeg(label.name, label.url, labelSize, DOTS_PER_MM)),
  )

  if (method === 'airprint-tape') {
    return buildPdf(
      images,
      images.map((_, index) => ({
        ...TAPE,
        items: [{ image: index, x: 0, y: 0, w: TAPE.widthMm, h: TAPE.heightMm }],
        cutLines: false,
      })),
    )
  }

  const perPage = A4.columns * A4.rows
  const pages: Page[] = []
  for (let start = 0; start < images.length; start += perPage) {
    const items: Placement[] = []
    for (let index = start; index < Math.min(images.length, start + perPage); index += 1) {
      const cell = index - start
      const column = cell % A4.columns
      const row = Math.floor(cell / A4.columns)
      items.push({
        image: index,
        x: A4.marginMm + column * (A4_LABEL.widthMm + A4.gapMm),
        y: A4.marginMm + row * (A4_LABEL.heightMm + A4.gapMm),
        w: A4_LABEL.widthMm,
        h: A4_LABEL.heightMm,
      })
    }
    pages.push({ widthMm: A4.widthMm, heightMm: A4.heightMm, items, cutLines: true })
  }
  return buildPdf(images, pages)
}
