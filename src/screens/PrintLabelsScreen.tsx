import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { KeepItState } from '../hooks/useKeepIt'
import { placeUrl } from '../data/placeCodes'
import { canHoldFreeLabels } from '../data/repository'
import type { Place } from '../types'

const LABELS_PER_PAGE = 12

type LabelView = Place & { qrDataUrl: string }

export function PrintLabelsScreen({ state, placeId }: { state: KeepItState; placeId?: string }) {
  const parentId = placeId ?? state.places.find((place) => place.type === 'object')?.id
  const [labels, setLabels] = useState<LabelView[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourcePlaces = useMemo(() => {
    if (!parentId) return [] as Place[]
    const self = state.findPlace(parentId)
    const children = state.childPlaces(parentId)
    return self ? [self, ...children] : children
  }, [parentId, state])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const prepared = await Promise.all(
        sourcePlaces.map(async (place) => ({
          ...place,
          qrDataUrl: await QRCode.toDataURL(placeUrl(place.id), {
            margin: 1,
            width: 256,
            errorCorrectionLevel: 'M',
          }),
        })),
      )
      if (!cancelled) setLabels(prepared)
    })()
    return () => {
      cancelled = true
    }
  }, [sourcePlaces])

  const parent = parentId ? state.findPlace(parentId) : undefined
  const canCreateFree = Boolean(parent && canHoldFreeLabels(parent.type))

  async function createSheet() {
    if (!parentId || !parent) return
    const question =
      `Создать ${LABELS_PER_PAGE} новых пустых мест «Свободная метка» внутри «${parent.name}»?\n\n` +
      'Это заготовки для будущих коробок: наклейте метку, а при первом сканировании задайте название. ' +
      'Для печати метки уже существующего места создавать ничего не нужно — нажмите «Печать».'
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    try {
      await state.makeFreeLabels(parentId, LABELS_PER_PAGE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Печать QR-меток (A4)</strong>
        <p className="muted">
          Метки для «{parent?.name ?? 'места'}» и вложенных в него мест — список ниже. Печать — через
          диалог браузера.
        </p>
        <button type="button" onClick={() => window.print()} disabled={labels.length === 0}>
          Печать
        </button>
        {canCreateFree ? (
          <>
            <p className="muted">
              Свободные метки — заготовки для будущих коробок: создаются {LABELS_PER_PAGE} пустых мест,
              название задаётся при первом сканировании.
            </p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void createSheet()}>
              Создать {LABELS_PER_PAGE} свободных меток
            </button>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="panel stack">
        <div className="list">
          {labels.map((label) => (
            <div key={label.id} className="list-item">
              <span>
                <strong>{label.name}</strong>
                <span className="place-code muted">{label.code}</span>
              </span>
              <img src={label.qrDataUrl} alt="" width={56} height={56} />
            </div>
          ))}
        </div>
      </div>

      <div className="label-sheet">
        {labels.map((label) => (
          <div key={label.id} className="label-card">
            <img src={label.qrDataUrl} alt="" />
            <div className="label-path">{label.code}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
