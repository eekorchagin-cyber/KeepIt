import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { KeepItState } from '../hooks/useKeepIt'
import { itemUrl } from '../data/placeCodes'
import { NfcLinkPanel } from './NfcLinkPanel'
import type { Item } from '../types'

/**
 * QR-код вещи (метка KeepIt): сканер открывает карточку, «Перенести сюда» выбирает вещь.
 * Печать — всегда этот QR программы, даже если вещи присвоен заводской штрихкод.
 */
export function ItemQrPanel({ state, item }: { state: KeepItState; item: Item }) {
  const hasFactoryCode = Boolean(item.extraCodes?.length)
  const printed = Boolean(item.keepitLabelPrintedAt)
  const [open, setOpen] = useState(printed || !hasFactoryCode)
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
        {open ? 'Скрыть QR-код KeepIt' : printed ? 'QR-код KeepIt (метка напечатана)' : 'QR-код KeepIt'}
      </button>
      {open ? (
        <>
          <div className="item-qr">
            {qr ? <img src={qr} alt={`QR-код вещи «${item.name}»`} width={140} height={140} /> : null}
            <span className="muted">
              {printed
                ? 'Метка KeepIt уже печаталась: сканируйте этот QR — откроется карточка. Заводской штрихкод, если был присвоен, тоже продолжает открывать вещь.'
                : hasFactoryCode
                  ? 'Сейчас вещь можно открыть по присвоенному заводскому коду. Напечатанная метка будет QR KeepIt (как здесь), а не копией заводского штрихкода — после печати этим QR тоже можно идентифицировать вещь.'
                  : 'Наклейте метку на вещь: сканер KeepIt откроет эту карточку, а в «Перенести сюда» вещь выберется для переноса.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => state.navigate({ name: 'print', placeId: item.placeId, itemId: item.id })}
          >
            Напечатать метку вещи
          </button>
          <span className="muted">Откроется печать с выбором принтера — на этикетке всегда QR KeepIt.</span>
          <NfcLinkPanel url={url} label="вещи" />
        </>
      ) : null}
    </div>
  )
}
