import QRCode from 'qrcode'
import type { LabelSize } from './printers'

const FONT = "700 {size}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"

function fontAt(size: number): string {
  return FONT.replace('{size}', String(Math.round(size)))
}

/** Перенос по словам; слишком длинное слово режется с дефисом. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  const push = (value: string) => {
    if (value) lines.push(value)
  }
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
      continue
    }
    push(line)
    line = ''
    let rest = word
    while (ctx.measureText(rest).width > maxWidth && rest.length > 2) {
      let cut = rest.length - 1
      while (cut > 1 && ctx.measureText(`${rest.slice(0, cut)}-`).width > maxWidth) cut -= 1
      push(`${rest.slice(0, cut)}-`)
      rest = rest.slice(cut)
    }
    line = rest
  }
  push(line)
  return lines
}

/**
 * Картинка этикетки точно под размер ленты: слева QR-код, справа название места.
 * QR рисуется по модулям без сглаживания — чёткая печать на термопринтере.
 */
function drawLabel(name: string, url: string, size: LabelSize, dotsPerMm: number): HTMLCanvasElement {
  const width = Math.round(size.widthMm * dotsPerMm)
  const height = Math.round(size.heightMm * dotsPerMm)
  const margin = Math.round(1.5 * dotsPerMm)
  const gap = Math.round(1.5 * dotsPerMm)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось подготовить картинку метки')
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)

  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const modules = qr.modules
  const quiet = 1
  const maxSide = Math.min(height - margin * 2, Math.round(width * 0.5))
  const cell = Math.max(1, Math.floor(maxSide / (modules.size + quiet * 2)))
  const qrSide = cell * (modules.size + quiet * 2)
  const qrX = margin
  const qrY = Math.round((height - qrSide) / 2)
  ctx.fillStyle = '#000'
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) {
        ctx.fillRect(qrX + (col + quiet) * cell, qrY + (row + quiet) * cell, cell, cell)
      }
    }
  }

  const textX = qrX + qrSide + gap
  const textWidth = width - textX - margin
  const textHeight = height - margin * 2
  let fontSize = Math.min(5 * dotsPerMm, textHeight / 2)
  const minFont = 2 * dotsPerMm
  let lines: string[] = []
  const words = name.split(/\s+/).filter(Boolean)
  while (fontSize >= minFont) {
    ctx.font = fontAt(fontSize)
    lines = wrapText(ctx, name, textWidth)
    // Слова не рвём, пока можно уменьшить шрифт
    const wordsFit = words.every((word) => ctx.measureText(word).width <= textWidth)
    const fits = lines.length * fontSize * 1.15 <= textHeight && lines.length <= 4
    if (fits && (wordsFit || fontSize - 0.5 * dotsPerMm < minFont)) break
    fontSize -= 0.5 * dotsPerMm
  }
  ctx.font = fontAt(fontSize)
  ctx.textBaseline = 'top'
  const lineHeight = fontSize * 1.15
  const shown = lines.slice(0, Math.max(1, Math.floor(textHeight / lineHeight)))
  const blockTop = Math.round((height - shown.length * lineHeight) / 2)
  shown.forEach((text, index) => ctx.fillText(text, textX, blockTop + index * lineHeight))
  return canvas
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сохранить картинку'))), type, quality),
  )
}

export function renderLabelPng(name: string, url: string, size: LabelSize, dotsPerMm: number): Promise<Blob> {
  return canvasBlob(drawLabel(name, url, size, dotsPerMm), 'image/png')
}

/** Метка в JPEG — для вставки в PDF (формат, который PDF принимает без перекодирования). */
export async function renderLabelJpeg(
  name: string,
  url: string,
  size: LabelSize,
  dotsPerMm: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const canvas = drawLabel(name, url, size, dotsPerMm)
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.95)
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'метка'
}

/** Отдать картинки через «Поделиться» (на телефоне — «Сохранить изображения»), иначе скачать. */
export function shareLabelImages(labels: Array<{ name: string; blob: Blob }>): Promise<'shared' | 'downloaded'> {
  return shareFiles(
    labels.map(
      (label, index) =>
        new File([label.blob], `${String(index + 1).padStart(2, '0')} ${safeFileName(label.name)}.png`, { type: 'image/png' }),
    ),
  )
}

/** «Поделиться» файлами (на телефоне — «Сохранить в Файлы» / «Сохранить изображения»), иначе скачать. */
export async function shareFiles(files: File[]): Promise<'shared' | 'downloaded'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: 'Метки KeepIt' })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
      // иначе — обычное скачивание
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    await new Promise((resolve) => window.setTimeout(resolve, 150))
  }
  return 'downloaded'
}
