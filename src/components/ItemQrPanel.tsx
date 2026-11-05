import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { KeepItState } from '../hooks/useKeepIt'
import { itemUrl } from '../data/placeCodes'
import type { Item } from '../types'

/**
 * QR-код вещи: сканер KeepIt открывает её карточку, а в «Перенести сюда» — выбирает её для переноса.
 * Печать метки — тот же экран и параметры принтера, что «Действия → Печать меток».
 */
export function ItemQrPanel({ state, item }: { state: KeepItState; item: Item }) {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
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
          <button
            type="button"
            onClick={() => state.navigate({ name: 'print', placeId: item.placeId, itemId: item.id })}
          >
            Напечатать метку вещи
          </button>
          <span className="muted">Откроется печать с выбором принтера — как в «Действия → Печать меток».</span>
        </>
      ) : null}
    </div>
  )
}
