import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { KeepItState } from '../hooks/useKeepIt'
import { itemUrl } from '../data/placeCodes'
import { renderLabelPng, safeFileName, shareFiles } from '../data/labelImage'
import type { Item } from '../types'

/** Размер метки вещи — как у небольшой самоклейки или ленты термопринтера */
const ITEM_LABEL = { widthMm: 50, heightMm: 30 }
const DOTS_PER_MM = 12

/**
 * QR-код вещи: сканер KeepIt открывает её карточку, а в «Перенести сюда» — выбирает её для переноса.
 * Метку можно сохранить картинкой или напечатать через «Поделиться» → «Напечатать».
 */
export function ItemQrPanel({ state, item }: { state: KeepItState; item: Item }) {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const url = itemUrl(item.id)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' }).then((data) => {
      if (!cancelled) setQr(data)
    })
    return () => {
      cancelled = true
    }
  }, [open, url])

  const path = state
    .pathFor(item.placeId)
    .map((part) => part.name)
    .join(' / ')

  async function shareLabel() {
    setBusy(true)
    setMessage(null)
    try {
      const blob = await renderLabelPng(item.name, url, ITEM_LABEL, DOTS_PER_MM, path)
      const result = await shareFiles([
        new File([blob], `Метка вещи — ${safeFileName(item.name)}.png`, { type: 'image/png' }),
      ])
      setMessage(
        result === 'shared'
          ? 'Метка передана: чтобы напечатать, выберите в меню «Напечатать», чтобы сохранить — «Сохранить изображение».'
          : 'Метка скачана картинкой — напечатайте её на принтере или в приложении принтера.',
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Не удалось подготовить метку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel stack">
      <button type="button" className="ghost crumb" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {open ? 'Скрыть QR-код вещи' : 'QR-код вещи'}
      </button>
      {open ? (
        <>
          <div className="item-qr">
            {qr ? <img src={qr} alt={`QR-код вещи «${item.name}»`} width={140} height={140} /> : null}
            <span className="muted">
              Наклейте метку на вещь: сканер KeepIt откроет эту карточку, а в «Перенести сюда» вещь выберется для
              переноса.
            </span>
          </div>
          <button type="button" disabled={busy} onClick={() => void shareLabel()}>
            {busy ? 'Готовлю метку…' : 'Метка вещи: напечатать или сохранить'}
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </>
      ) : null}
    </div>
  )
}
