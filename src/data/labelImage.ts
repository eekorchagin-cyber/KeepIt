import QRCode from 'qrcode'
import type { LabelSize } from './printers'
import type { TextPlacement } from './labelSheets'

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

function pathFontAt(size: number): string {
  return fontAt(size).replace(/^700/, '500')
}

/**
 * Название и (мельче) путь в прямоугольнике: шрифт подбирается, чтобы всё поместилось и слова не рвались.
 * align: 'left' — текст справа от QR, 'center' — под QR.
 */
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  name: string,
  path: string,
  dotsPerMm: number,
  align: 'left' | 'center',
) {
  const { width: textWidth, height: textHeight } = box
  const minFont = Math.min(2 * dotsPerMm, textHeight / 2)
  let fontSize = Math.max(minFont, Math.min(5 * dotsPerMm, textHeight / 2))
  const pathFontFor = (nameFont: number) =>
    Math.max(Math.min(2 * dotsPerMm, minFont), Math.min(3 * dotsPerMm, nameFont * 0.62))
  const pathGap = path ? Math.round(0.8 * dotsPerMm) : 0
  let lines: string[] = []
  let pathLines: string[] = []
  const words = name.split(/\s+/).filter(Boolean)
  while (fontSize >= minFont) {
    ctx.font = fontAt(fontSize)
    lines = wrapText(ctx, name, textWidth)
    // Слова не рвём, пока можно уменьшить шрифт
    const wordsFit = words.every((word) => ctx.measureText(word).width <= textWidth)
    const pathFont = pathFontFor(fontSize)
    ctx.font = pathFontAt(pathFont)
    pathLines = path ? wrapText(ctx, path, textWidth).slice(0, align === 'center' ? 2 : 3) : []
    const blockHeight = lines.length * fontSize * 1.15 + pathGap + pathLines.length * pathFont * 1.2
    const fits = blockHeight <= textHeight && lines.length <= 4
    if (fits && (wordsFit || fontSize - 0.5 * dotsPerMm < minFont)) break
    fontSize -= 0.5 * dotsPerMm
  }
  fontSize = Math.max(fontSize, minFont)
  ctx.textBaseline = 'top'
  ctx.textAlign = align
  const textX = align === 'center' ? box.x + textWidth / 2 : box.x
  const lineHeight = fontSize * 1.15
  const pathFont = pathFontFor(fontSize)
  const pathLineHeight = pathFont * 1.2
  const shown = lines.slice(0, Math.max(1, Math.floor(textHeight / lineHeight)))
  // Путь — только если остаётся место: название важнее
  const pathRoom = Math.floor((textHeight - shown.length * lineHeight - pathGap) / pathLineHeight)
  const pathShown = pathRoom > 0 ? pathLines.slice(0, pathRoom) : []
  const blockHeight = shown.length * lineHeight + (pathShown.length ? pathGap + pathShown.length * pathLineHeight : 0)
  const blockTop = Math.round(box.y + (textHeight - Math.min(blockHeight, textHeight)) / 2)
  ctx.font = fontAt(fontSize)
  shown.forEach((text, index) => ctx.fillText(text, textX, blockTop + index * lineHeight))
  ctx.font = pathFontAt(pathFont)
  const pathTop = blockTop + shown.length * lineHeight + pathGap
  pathShown.forEach((text, index) => ctx.fillText(text, textX, pathTop + index * pathLineHeight))
  ctx.textAlign = 'left'
}

/**
 * Картинка этикетки точно под её размер: QR-код и название места, мельче — путь к нему.
 * Текст справа от QR или под ним. QR рисуется по модулям без сглаживания — чёткая печать.
 */
function drawLabel(
  name: string,
  url: string,
  size: LabelSize,
  dotsPerMm: number,
  path = '',
  placement: TextPlacement = 'right',
): HTMLCanvasElement {
  const width = Math.round(size.widthMm * dotsPerMm)
  const height = Math.round(size.heightMm * dotsPerMm)
  const margin = Math.round(1.5 * dotsPerMm)
  const gap = Math.round((placement === 'below' ? 0.8 : 1.5) * dotsPerMm)

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
  const maxSide =
    placement === 'below'
      ? Math.min(width - margin * 2, Math.round((height - margin * 2) * 0.62))
      : Math.min(height - margin * 2, Math.round(width * 0.5))
  const cell = Math.max(1, Math.floor(maxSide / (modules.size + quiet * 2)))
  const qrSide = cell * (modules.size + quiet * 2)
  const qrX = placement === 'below' ? Math.round((width - qrSide) / 2) : margin
  const qrY = placement === 'below' ? margin : Math.round((height - qrSide) / 2)
  ctx.fillStyle = '#000'
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) {
        ctx.fillRect(qrX + (col + quiet) * cell, qrY + (row + quiet) * cell, cell, cell)
      }
    }
  }

  if (placement === 'below') {
    const top = qrY + qrSide + gap
    drawTextBlock(
      ctx,
      { x: margin, y: top, width: width - margin * 2, height: height - margin - top },
      name,
      path,
      dotsPerMm,
      'center',
    )
  } else {
    const textX = qrX + qrSide + gap
    drawTextBlock(
      ctx,
      { x: textX, y: margin, width: width - textX - margin, height: height - margin * 2 },
      name,
      path,
      dotsPerMm,
      'left',
    )
  }
  return canvas
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сохранить картинку'))), type, quality),
  )
}

export function renderLabelPng(
  name: string,
  url: string,
  size: LabelSize,
  dotsPerMm: number,
  path = '',
  placement: TextPlacement = 'right',
): Promise<Blob> {
  return canvasBlob(drawLabel(name, url, size, dotsPerMm, path, placement), 'image/png')
}

/** Метка картинкой для печати через системное окно — та же, что в PDF */
export function renderLabelDataUrl(
  name: string,
  url: string,
  size: LabelSize,
  dotsPerMm: number,
  path = '',
  placement: TextPlacement = 'right',
): string {
  return drawLabel(name, url, size, dotsPerMm, path, placement).toDataURL('image/png')
}

/** Метка в JPEG — для вставки в PDF (формат, который PDF принимает без перекодирования). */
export async function renderLabelJpeg(
  name: string,
  url: string,
  size: LabelSize,
  dotsPerMm: number,
  path = '',
  placement: TextPlacement = 'right',
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const canvas = drawLabel(name, url, size, dotsPerMm, path, placement)
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
