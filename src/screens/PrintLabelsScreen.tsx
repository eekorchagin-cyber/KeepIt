import { useEffect, useMemo, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import QRCode from 'qrcode'
import { PlaceStepPicker } from '../components/PlaceStepPicker'
import type { KeepItState } from '../hooks/useKeepIt'
import { placeUrl } from '../data/placeCodes'
import { canHoldFreeLabels } from '../data/repository'
import { renderLabelPng, safeFileName, shareFiles, shareLabelImages } from '../data/labelImage'
import { renderLabelsPdf } from '../data/labelPdf'
import { DEFAULT_PRINTER_ID, PRINTERS, findPrinter, sizeLabel, type LabelSize } from '../data/printers'
import type { Place } from '../types'

const FREE_LABEL_COUNTS = [6, 12, 24]
const PRINTER_KEY = 'keepit-printer'
const SIZE_KEY = 'keepit-label-size'

type PrintMode = 'room' | 'single'
/** Куда выводить метки AirPrint-принтера: системное окно печати или PDF-файл */
type OutputTarget = 'print' | 'pdf'

type LabelView = Place & { qrDataUrl: string }
type LabelImage = { id: string; name: string; blob: Blob; previewUrl: string }

const AIRPRINT_PAGE: Record<string, string> = {
  'airprint-tape': '@page { size: 62mm 40mm; margin: 2mm; }',
  'airprint-a4': '@page { size: A4; margin: 10mm; }',
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // приватный режим
  }
}

/** Список меток: название, полный путь и QR-код. */
function LabelList({ title, labels }: { title: string; labels: LabelView[] }) {
  return (
    <div className="stack">
      <strong>{title}</strong>
      {labels.length === 0 ? <span className="muted">Выберите место</span> : null}
      <div className="list">
        {labels.map((label) => (
          <div key={label.id} className="list-item">
            <span className="stack-tight">
              <strong>{label.name}</strong>
              <span className="place-code muted">{label.code}</span>
            </span>
            <img src={label.qrDataUrl} alt="" width={56} height={56} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PrintLabelsScreen({ state, placeId }: { state: KeepItState; placeId?: string }) {
  const startId = placeId ?? state.places.find((place) => place.type === 'object')?.id ?? ''
  const start = state.findPlace(startId)

  /** Ближайшее помещение вверх по пути (или сам объект, если помещения нет). */
  function roomOf(id: string): string {
    const path = state.pathFor(id)
    const room = [...path].reverse().find((part) => part.type === 'room')
    return room?.id ?? path[0]?.id ?? id
  }

  const [mode, setMode] = useState<PrintMode>(() =>
    !start || start.type === 'room' || start.type === 'object' ? 'room' : 'single',
  )
  const [roomId, setRoomId] = useState(() => (startId ? roomOf(startId) : ''))
  const [singleId, setSingleId] = useState(startId)
  const [printerId, setPrinterId] = useState(() => findPrinter(readStored(PRINTER_KEY) ?? DEFAULT_PRINTER_ID).id)
  const [sizeIndex, setSizeIndex] = useState(() => Number(readStored(SIZE_KEY) ?? 0) || 0)
  const [labels, setLabels] = useState<LabelView[]>([])
  const [images, setImages] = useState<LabelImage[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Готовый PDF и набор меток (с принтером), для которого он собран */
  const [pdfResult, setPdf] = useState<{ file: File; key: string } | null>(null)
  const [askFree, setAskFree] = useState<OutputTarget | null>(null)
  const [freeCount, setFreeCount] = useState(12)
  /** Свободные метки, созданные перед печатью — печатаются вместе с выбранными местами */
  const [extraPlaces, setExtraPlaces] = useState<Place[]>([])

  const printer = findPrinter(printerId)
  const size: LabelSize = printer.sizes[sizeIndex] ?? printer.sizes[0]!
  const isAirPrint = printer.method !== 'image'

  const objectKey = start?.objectKey
  const objectPlaces = state.places.filter((place) => place.objectKey === objectKey)
  const roomOptions = [
    ...objectPlaces
      .filter((place) => place.type === 'object')
      .map((place) => ({ id: place.id, label: `Весь объект «${place.name}»` })),
    ...objectPlaces
      .filter((place) => place.type === 'room')
      .map((place) => ({ id: place.id, label: place.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
  ]
  const sourcePlaces = useMemo(() => {
    if (mode === 'single') {
      const one = state.findPlace(singleId)
      return one ? [one] : []
    }
    const root = state.findPlace(roomId)
    if (!root) return [] as Place[]
    const result: Place[] = []
    const visit = (place: Place) => {
      result.push(place)
      for (const child of state.childPlaces(place.id)) visit(child)
    }
    visit(root)
    return result
  }, [mode, roomId, singleId, state])

  const printList = useMemo(() => {
    const seen = new Set(sourcePlaces.map((place) => place.id))
    return [...sourcePlaces, ...extraPlaces.filter((place) => !seen.has(place.id))]
  }, [sourcePlaces, extraPlaces])

  function labelSetKey(list: Place[]): string {
    return `${printer.id}:${list
      .map((place) => place.id)
      .sort()
      .join(',')}`
  }
  const pdf = pdfResult && pdfResult.key === labelSetKey(printList) ? pdfResult.file : null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const prepared = await Promise.all(
        printList.map(async (place) => ({
          ...place,
          qrDataUrl: await QRCode.toDataURL(placeUrl(place.id), {
            margin: 1,
            width: 320,
            errorCorrectionLevel: 'M',
          }),
        })),
      )
      if (!cancelled) setLabels(prepared)
    })()
    return () => {
      cancelled = true
    }
  }, [printList])

  // Освобождаем ссылки на превью предыдущего набора картинок
  useEffect(() => {
    return () => {
      for (const image of images) URL.revokeObjectURL(image.previewUrl)
    }
  }, [images])

  /**
   * AirPrint — системное окно печати (недостающие QR дорисовываются и сразу попадают в слой печати);
   * термопринтер — картинки точно под размер этикетки.
   */
  async function output(list: Place[], target: OutputTarget) {
    setBusy(true)
    setError(null)
    try {
      if (isAirPrint && target === 'pdf') {
        const blob = await renderLabelsPdf(
          list.map((place) => ({ name: place.name, url: placeUrl(place.id) })),
          printer.method === 'airprint-tape' ? 'airprint-tape' : 'airprint-a4',
        )
        const title = list.length === 1 ? safeFileName(list[0]!.name) : `${list.length} шт.`
        setPdf({
          file: new File([blob], `Метки KeepIt — ${title}.pdf`, { type: 'application/pdf' }),
          key: labelSetKey(list),
        })
        setMessage(`PDF готов: меток ${list.length}. Нажмите «Сохранить PDF».`)
        return
      }
      if (isAirPrint) {
        const known = new Map(labels.map((label) => [label.id, label]))
        const full = await Promise.all(
          list.map(
            async (place) =>
              known.get(place.id) ?? {
                ...place,
                qrDataUrl: await QRCode.toDataURL(placeUrl(place.id), {
                  margin: 1,
                  width: 320,
                  errorCorrectionLevel: 'M',
                }),
              },
          ),
        )
        flushSync(() => setLabels(full))
        window.print()
        return
      }
      const prepared = await Promise.all(
        list.map(async (place) => {
          const blob = await renderLabelPng(place.name, placeUrl(place.id), size, printer.dotsPerMm)
          return { id: place.id, name: place.name, blob, previewUrl: URL.createObjectURL(blob) }
        }),
      )
      setImages(prepared)
      setMessage(`Готово картинок: ${prepared.length} (${sizeLabel(size)}). Нажмите «Сохранить картинки».`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подготовить метки')
    } finally {
      setBusy(false)
    }
  }

  function choosePrinter(id: string) {
    setPrinterId(id)
    setSizeIndex(0)
    setImages([])
    setPdf(null)
    setMessage(null)
    writeStored(PRINTER_KEY, id)
    writeStored(SIZE_KEY, '0')
  }

  function chooseSize(index: number) {
    setSizeIndex(index)
    setImages([])
    setMessage(null)
    writeStored(SIZE_KEY, String(index))
  }

  /** Куда класть свободные метки: выбранное помещение или помещение выбранного места. */
  const freeParent = state.findPlace(mode === 'room' ? roomId : roomOf(singleId))
  const canCreateFree = Boolean(freeParent && canHoldFreeLabels(freeParent.type))

  function onMainClick(target: OutputTarget) {
    setError(null)
    setMessage(null)
    setImages([])
    setPdf(null)
    if (canCreateFree) setAskFree(target)
    else void output(printList, target)
  }

  async function withFree(create: boolean) {
    const target = askFree ?? 'print'
    setAskFree(null)
    if (!create || !freeParent) {
      void output(printList, target)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await state.makeFreeLabels(freeParent.id, freeCount)
      setExtraPlaces((current) => [...current, ...created])
      const seen = new Set(printList.map((place) => place.id))
      await output([...printList, ...created.filter((place) => !seen.has(place.id))], target)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(false)
    }
  }

  async function saveImages() {
    setError(null)
    try {
      const result = await shareLabelImages(images)
      setMessage(
        result === 'shared'
          ? 'Картинки переданы. Теперь откройте приложение принтера и напечатайте их (шаги выше).'
          : 'Картинки скачаны. Откройте их в приложении принтера (шаги выше).',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить картинки')
    }
  }

  async function savePdf() {
    if (!pdf) return
    setError(null)
    try {
      const result = await shareFiles([pdf])
      setMessage(
        result === 'shared'
          ? 'PDF передан. Чтобы сохранить его, выберите «Сохранить в Файлы».'
          : 'PDF скачан в «Загрузки».',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить PDF')
    }
  }

  const mainLabel = busy
    ? 'Готовлю метки…'
    : isAirPrint
      ? `Печать (${printList.length})`
      : `Подготовить метки-картинки (${printList.length})`

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Что печатать</strong>
        <div className="split-row">
          <button type="button" className={mode === 'room' ? undefined : 'secondary'} onClick={() => setMode('room')}>
            Все места в помещении
          </button>
          <button
            type="button"
            className={mode === 'single' ? undefined : 'secondary'}
            onClick={() => setMode('single')}
          >
            Одно место
          </button>
        </div>
        {mode === 'room' ? (
          <label className="field">
            Помещение
            <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {roomOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <PlaceStepPicker state={state} value={singleId} onChange={setSingleId} />
        )}
        {mode === 'room' ? (
          <p className="muted">
            Метки на помещение и все места в нём на любой глубине (стеллажи, полки, коробки):{' '}
            {sourcePlaces.length}. На этикетке — QR-код и название места.
          </p>
        ) : (
          <LabelList title="Метки к печати" labels={labels} />
        )}
      </div>

      <div className="panel stack">
        <strong>Принтер</strong>
        <label className="field">
          Модель
          <select value={printer.id} onChange={(event) => choosePrinter(event.target.value)}>
            <optgroup label="AirPrint — печать прямо из KeepIt">
              {PRINTERS.filter((entry) => entry.method !== 'image').map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Через приложение принтера">
              {PRINTERS.filter((entry) => entry.method === 'image').map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <span className="muted">{printer.kind}</span>
        {!isAirPrint ? (
          <label className="field">
            Размер этикетки
            <select value={sizeIndex} onChange={(event) => chooseSize(Number(event.target.value))}>
              {printer.sizes.map((entry, index) => (
                <option key={sizeLabel(entry)} value={index}>
                  {sizeLabel(entry)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <strong>Как печатать</strong>
        <ol className="print-steps">
          {printer.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <button type="button" onClick={() => onMainClick('print')} disabled={printList.length === 0 || busy}>
          {mainLabel}
        </button>
        {isAirPrint ? (
          <button
            type="button"
            className="secondary"
            onClick={() => onMainClick('pdf')}
            disabled={printList.length === 0 || busy}
          >
            Печать в файл PDF ({printList.length})
          </button>
        ) : null}
        {pdf ? (
          <button type="button" onClick={() => void savePdf()}>
            Сохранить PDF
          </button>
        ) : null}
        {images.length > 0 ? (
          <button type="button" onClick={() => void saveImages()}>
            Сохранить картинки ({images.length})
          </button>
        ) : null}
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {images.length > 0 ? (
        <div className="panel stack">
          <strong>Метки-картинки · {sizeLabel(size)}</strong>
          <div className="label-previews">
            {images.map((image) => (
              <img key={image.id} src={image.previewUrl} alt={image.name} />
            ))}
          </div>
        </div>
      ) : mode === 'room' ? (
        <div className="panel stack">
          <LabelList title="Метки к печати" labels={labels} />
        </div>
      ) : null}

      {askFree && freeParent ? (
        <div className="sheet-backdrop" onClick={() => setAskFree(null)} role="presentation">
          <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
            <div className="row">
              <strong className="grow">Создать свободные метки?</strong>
              <button type="button" className="icon-btn" onClick={() => setAskFree(null)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="stack">
              <p className="muted">
                Свободные метки — заготовки для будущих коробок. В «{freeParent.name}» появятся пустые места
                «Свободная метка», их метки напечатаются вместе с выбранными. Название задаётся при первом
                сканировании.
              </p>
              <label className="field">
                Сколько свободных меток
                <select value={freeCount} onChange={(event) => setFreeCount(Number(event.target.value))}>
                  {FREE_LABEL_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="secondary" disabled={busy} onClick={() => void withFree(false)}>
                Нет, только выбранные ({printList.length})
              </button>
              <button type="button" disabled={busy} onClick={() => void withFree(true)}>
                Да, создать {freeCount} ({printList.length + freeCount})
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAirPrint
        ? createPortal(
            <div
              className={`print-root ${printer.method === 'airprint-tape' ? 'print-tape62' : 'print-a4'}`}
              aria-hidden
            >
              <style>{`@media print { ${AIRPRINT_PAGE[printer.method]} }`}</style>
              {labels.map((label) =>
                printer.method === 'airprint-tape' ? (
                  <div key={label.id} className="tape-label">
                    <img src={label.qrDataUrl} alt="" />
                    <div className="tape-name">{label.name}</div>
                  </div>
                ) : (
                  <div key={label.id} className="label-card">
                    <img src={label.qrDataUrl} alt="" />
                    <div className="label-name">{label.name}</div>
                  </div>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
