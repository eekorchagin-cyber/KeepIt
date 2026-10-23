import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { PlaceStepPicker } from '../components/PlaceStepPicker'
import { ChoiceSelect } from '../components/ChoiceSelect'
import type { KeepItState } from '../hooks/useKeepIt'
import { placeUrl } from '../data/placeCodes'
import { canHoldFreeLabels } from '../data/repository'
import { renderLabelDataUrl, renderLabelPng, safeFileName, shareFiles, shareLabelImages } from '../data/labelImage'
import { LABEL_DOTS_PER_MM, renderLabelsPdf } from '../data/labelPdf'
import {
  DEFAULT_SHEET_ID,
  PAPER_OPTIONS,
  SHEET_KIND_TITLE,
  SHEET_LAYOUTS,
  TAPE_LABEL,
  TEXT_PLACEMENT_OPTIONS,
  findSheet,
  hasCutLines,
  labelsPerSheet,
  sheetForPaper,
  sheetLabel,
  sheetPages,
  sheetPaper,
  type TextPlacement,
} from '../data/labelSheets'
import { DEFAULT_PRINTER_ID, PRINTERS, findPrinter, sizeLabel, type LabelSize } from '../data/printers'
import type { Place } from '../types'

const FREE_LABEL_COUNTS = [6, 12, 24]
const PRINTER_KEY = 'keepit-printer'
const SIZE_KEY = 'keepit-label-size'
const SHEET_KEY = 'keepit-a4-sheet'
const PLACEMENT_KEY = 'keepit-label-text'

/** Готовые к печати страницы: картинки меток с положением в мм — та же раскладка, что в PDF */
type PrintJob = {
  /** Для какого набора (принтер, лист, текст, места) подготовлено */
  key: string
  pageWidthMm: number
  pageHeightMm: number
  cutLines: boolean
  pages: Array<Array<{ id: string; src: string; x: number; y: number; w: number; h: number }>>
}

type PrintMode = 'room' | 'single'
/** Куда выводить метки AirPrint-принтера: системное окно печати или PDF-файл */
type OutputTarget = 'print' | 'pdf'

type LabelView = Place & { qrDataUrl: string }
type LabelImage = { id: string; name: string; blob: Blob; previewUrl: string }

/**
 * iPhone / iPad: программа на экране «Домой» не открывает окно печати из веб-приложения,
 * поэтому там печатаем через PDF → «Поделиться» → «Напечатать» (то же окно AirPrint).
 */
const PRINT_VIA_SHARE =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

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

/** Список меток: название, путь (полный или внутри помещения) и QR-код. */
function LabelList({
  title,
  labels,
  pathOf,
}: {
  title: string
  labels: LabelView[]
  pathOf: (id: string) => string
}) {
  return (
    <div className="stack">
      <strong>{title}</strong>
      {labels.length === 0 ? <span className="muted">Выберите место</span> : null}
      <div className="list">
        {labels.map((label) => (
          <div key={label.id} className="list-item">
            <span className="stack-tight">
              <strong>{label.name}</strong>
              {pathOf(label.id) ? <span className="place-code muted">{pathOf(label.id)}</span> : null}
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

  /**
   * Помещение места: ближайшее вверх по пути с типом «помещение», иначе место первого уровня внутри объекта
   * (например «Каменный гараж»), для самого объекта — объект.
   */
  function roomOf(id: string): string {
    const path = state.pathFor(id)
    const room = [...path].reverse().find((part) => part.type === 'room')
    return room?.id ?? path[1]?.id ?? path[0]?.id ?? id
  }

  /** Помещение или объект: для них — «Все места в помещении» с выбором помещения */
  const isRoomLike = (place: Place) => place.type === 'object' || place.type === 'room' || roomOf(place.id) === place.id
  /** Стеллаж, шкаф, полка, коробка: вместо помещения печатаем это место и всё, что в нём */
  const nestedRoot = start && !isRoomLike(start) ? start : undefined

  const [mode, setMode] = useState<PrintMode>(() =>
    !start || isRoomLike(start) || state.childPlaces(start.id).length > 0 ? 'room' : 'single',
  )
  const [roomId, setRoomId] = useState(() => (nestedRoot ? nestedRoot.id : startId ? roomOf(startId) : ''))
  const [singleId, setSingleId] = useState(startId)
  const [printerId, setPrinterId] = useState(() => findPrinter(readStored(PRINTER_KEY) ?? DEFAULT_PRINTER_ID).id)
  const [sizeIndex, setSizeIndex] = useState(() => Number(readStored(SIZE_KEY) ?? 0) || 0)
  const [sheetId, setSheetId] = useState(() => findSheet(readStored(SHEET_KEY) ?? DEFAULT_SHEET_ID).id)
  const [placement, setPlacement] = useState<TextPlacement>(() =>
    readStored(PLACEMENT_KEY) === 'below' ? 'below' : 'right',
  )
  /** Ответ на вопрос о свободных метках уже дан — больше не спрашиваем в этой печати */
  const [freeDecided, setFreeDecided] = useState(false)
  const [labels, setLabels] = useState<LabelView[]>([])
  const [images, setImages] = useState<LabelImage[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Готовый PDF и набор меток (с принтером), для которого он собран */
  /** purpose: print — PDF для печати через «Поделиться» (iPhone), save — сохранить файл */
  const [pdfResult, setPdf] = useState<{ file: File; key: string; purpose: 'print' | 'save' } | null>(null)
  const [askFree, setAskFree] = useState<OutputTarget | null>(null)
  const [freeCount, setFreeCount] = useState(12)
  /** Свободные метки, созданные перед печатью — печатаются вместе с выбранными местами */
  const [extraPlaces, setExtraPlaces] = useState<Place[]>([])

  const printer = findPrinter(printerId)
  const size: LabelSize = printer.sizes[sizeIndex] ?? printer.sizes[0]!
  const isAirPrint = printer.method !== 'image'
  /** Печать через системное окно браузера (компьютер); на iPhone — через PDF и «Поделиться» */
  const directPrint = isAirPrint && !PRINT_VIA_SHARE
  const sheet = findSheet(sheetId)

  const objectKey = start?.objectKey
  const objectPlaces = state.places.filter((place) => place.objectKey === objectKey)
  const objectRoot = objectPlaces.find((place) => place.type === 'object')
  const roomOptions = [
    ...(objectRoot ? [{ id: objectRoot.id, label: `Весь объект «${objectRoot.name}»` }] : []),
    ...objectPlaces
      .filter((place) => place.type === 'room' || (objectRoot && place.parentId === objectRoot.id))
      .map((place) => ({
        id: place.id,
        label: state
          .pathFor(place.id)
          .slice(1)
          .map((part) => part.name)
          .join(' / '),
      }))
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

  /** Путь к месту без его названия: «Дача / Каменный гараж» — печатается на метке под названием */
  function parentPath(id: string): string {
    return state
      .pathFor(id)
      .slice(0, -1)
      .map((part) => part.name)
      .join(' / ')
  }

  /** Путь внутри выбранного помещения — в списке «Метки к печати» */
  function pathInRoom(id: string): string {
    const path = state.pathFor(id)
    const index = path.findIndex((part) => part.id === roomId)
    return path
      .slice(index >= 0 ? index + 1 : 1, -1)
      .map((part) => part.name)
      .join(' / ')
  }

  function labelSetKey(list: Place[]): string {
    return `${printer.id}:${sheet.id}:${placement}:${list
      .map((place) => place.id)
      .sort()
      .join(',')}`
  }
  const pdf = pdfResult && pdfResult.key === labelSetKey(printList) ? pdfResult.file : null
  const pdfPurpose = pdfResult?.purpose ?? 'save'

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
   * Страницы для системного окна печати — те же картинки и та же раскладка, что в PDF.
   * Картинки рисуются порциями с паузами, чтобы экран не подвисал на больших наборах.
   */
  async function buildPrintJob(list: Place[], isCancelled: () => boolean): Promise<PrintJob | null> {
    const tape = printer.method === 'airprint-tape'
    const size = tape ? TAPE_LABEL : sheet
    const sources: string[] = []
    for (let index = 0; index < list.length; index += 1) {
      if (index > 0 && index % 8 === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 0))
        if (isCancelled()) return null
      }
      const place = list[index]!
      sources.push(renderLabelDataUrl(place.name, placeUrl(place.id), size, LABEL_DOTS_PER_MM, parentPath(place.id), placement))
    }
    const key = labelSetKey(list)
    if (tape) {
      return {
        key,
        pageWidthMm: TAPE_LABEL.widthMm,
        pageHeightMm: TAPE_LABEL.heightMm,
        cutLines: false,
        pages: list.map((place, index) => [
          { id: place.id, src: sources[index]!, x: 0, y: 0, w: TAPE_LABEL.widthMm, h: TAPE_LABEL.heightMm },
        ]),
      }
    }
    return {
      key,
      pageWidthMm: sheetPaper(sheet).widthMm,
      pageHeightMm: sheetPaper(sheet).heightMm,
      cutLines: hasCutLines(sheet),
      pages: sheetPages(sheet, list.length).map((cells) =>
        cells.map((cell) => ({
          id: list[cell.index]!.id,
          src: sources[cell.index]!,
          x: cell.x,
          y: cell.y,
          w: cell.w,
          h: cell.h,
        })),
      ),
    }
  }

  // Заранее готовим страницы печати, чтобы по нажатию «Печать» сразу открыть окно (требование iPhone)
  const [printJob, setPrintJob] = useState<PrintJob | null>(null)
  const printSetKey = directPrint ? labelSetKey(printList) : ''
  useEffect(() => {
    if (!printSetKey || printList.length === 0) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void buildPrintJob(printList, () => cancelled).then((job) => {
        if (!cancelled && job) setPrintJob(job)
      })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // Ключ набора уже учитывает принтер, лист, текст и состав меток
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printSetKey, state.places])

  /**
   * AirPrint — системное окно печати или PDF: одни и те же картинки меток в одной раскладке;
   * термопринтер — картинки точно под размер этикетки.
   */
  async function output(list: Place[], target: OutputTarget) {
    setBusy(true)
    setError(null)
    try {
      if (isAirPrint && (target === 'pdf' || !directPrint)) {
        const purpose = target === 'print' ? 'print' : 'save'
        const blob = await renderLabelsPdf(
          list.map((place) => ({ name: place.name, url: placeUrl(place.id), path: parentPath(place.id) })),
          printer.method === 'airprint-tape' ? 'airprint-tape' : 'airprint-a4',
          { sheet, placement },
        )
        const title = list.length === 1 ? safeFileName(list[0]!.name) : `${list.length} шт.`
        setPdf({
          file: new File([blob], `Метки KeepIt — ${title}.pdf`, { type: 'application/pdf' }),
          key: labelSetKey(list),
          purpose,
        })
        setMessage(
          purpose === 'print'
            ? `Метки готовы: ${list.length}. Нажмите «Напечатать» и в меню выберите «Напечатать».`
            : `PDF готов: меток ${list.length}. Нажмите «Сохранить PDF».`,
        )
        return
      }
      const prepared = await Promise.all(
        list.map(async (place) => {
          const blob = await renderLabelPng(
            place.name,
            placeUrl(place.id),
            size,
            printer.dotsPerMm,
            parentPath(place.id),
            placement,
          )
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

  function chooseSheet(id: string) {
    setSheetId(id)
    setPdf(null)
    setMessage(null)
    writeStored(SHEET_KEY, id)
  }

  function choosePlacement(next: TextPlacement) {
    setPlacement(next)
    setImages([])
    setPdf(null)
    setMessage(null)
    writeStored(PLACEMENT_KEY, next)
  }

  function chooseSize(index: number) {
    setSizeIndex(index)
    setImages([])
    setMessage(null)
    writeStored(SIZE_KEY, String(index))
  }

  /** Куда класть свободные метки: выбранное помещение или помещение выбранного места. */
  const freeParent = state.findPlace(mode === 'room' ? roomId : roomOf(singleId))
  // Не во весь объект: иначе заготовки встают в один ряд с помещениями
  const canCreateFree = Boolean(freeParent && canHoldFreeLabels(freeParent.type))
  /** Сколько этикеток останется пустыми на последнем листе A4 — их удобно занять свободными метками */
  const sheetRemainder =
    printer.method === 'airprint-a4' && printList.length > 0
      ? (sheet.cols * sheet.rows - (printList.length % (sheet.cols * sheet.rows))) % (sheet.cols * sheet.rows)
      : 0
  const freeCountOptions = [
    ...(sheetRemainder > 0
      ? [{ value: sheetRemainder, label: `${sheetRemainder} — дополнить лист до конца`, hint: sheetLabel(sheet) }]
      : []),
    ...FREE_LABEL_COUNTS.filter((count) => count !== sheetRemainder).map((count) => ({
      value: count,
      label: String(count),
    })),
  ]
  const freeParentPath = freeParent
    ? state
        .pathFor(freeParent.id)
        .map((part) => part.name)
        .join(' / ')
    : ''

  /**
   * Системное окно печати. На iPhone Safari открывает его, только если печать вызвана прямо в нажатии,
   * без ожидания, — поэтому страницы печати готовятся заранее (printJob), а здесь только window.print().
   */
  function printNow() {
    if (!printJob || printJob.key !== printSetKey) {
      setError('Метки ещё готовятся — нажмите «Печать» через секунду.')
      return
    }
    window.print()
  }

  function onMainClick(target: OutputTarget) {
    setError(null)
    setMessage(null)
    setImages([])
    setPdf(null)
    if (canCreateFree && !freeDecided) {
      // По умолчанию — дополнить последний лист, чтобы не оставалось пустых этикеток
      if (sheetRemainder > 0) setFreeCount(sheetRemainder)
      else if (!FREE_LABEL_COUNTS.includes(freeCount)) setFreeCount(12)
      setAskFree(target)
      return
    }
    if (target === 'print' && directPrint) printNow()
    else void output(printList, target)
  }

  async function withFree(create: boolean) {
    const target = askFree ?? 'print'
    setAskFree(null)
    setFreeDecided(true)
    if (!create || !freeParent) {
      if (target === 'print' && directPrint) printNow()
      else void output(printList, target)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await state.makeFreeLabels(freeParent.id, freeCount)
      setExtraPlaces((current) => [...current, ...created])
      const seen = new Set(printList.map((place) => place.id))
      const full = [...printList, ...created.filter((place) => !seen.has(place.id))]
      if (target === 'print' && directPrint) {
        // Создание меток заняло время — окно печати откроется по следующему нажатию
        setMessage(`Свободные метки созданы (${created.length}). Нажмите «Печать» ещё раз.`)
        setBusy(false)
        return
      }
      await output(full, target)
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
        pdfPurpose === 'print'
          ? result === 'shared'
            ? 'Если окно печати не открылось — снова нажмите «Напечатать» и выберите «Напечатать» в меню.'
            : 'PDF скачан — откройте его и напечатайте.'
          : result === 'shared'
            ? 'PDF передан. Чтобы сохранить его, выберите «Сохранить в Файлы».'
            : 'PDF скачан в «Загрузки».',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить PDF')
    }
  }

  /** Страницы печати подготовлены для текущего набора — можно сразу открывать окно печати */
  const printReady = Boolean(printJob && printJob.key === printSetKey)
  const mainLabel =
    busy || (directPrint && printList.length > 0 && !printReady)
      ? 'Готовлю метки…'
      : directPrint
        ? `Печать (${printList.length})`
        : isAirPrint
          ? `Подготовить к печати (${printList.length})`
          : `Подготовить метки-картинки (${printList.length})`

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Что печатать</strong>
        <div className="split-row">
          <button type="button" className={mode === 'room' ? undefined : 'secondary'} onClick={() => setMode('room')}>
            {nestedRoot ? 'Все вложенные места хранения' : 'Все места в помещении'}
          </button>
          <button
            type="button"
            className={mode === 'single' ? undefined : 'secondary'}
            onClick={() => setMode('single')}
          >
            Одно место
          </button>
        </div>
        {mode === 'room' && nestedRoot ? (
          <div className="stack-tight">
            <strong>{nestedRoot.name}</strong>
            <span className="place-code muted">{parentPath(nestedRoot.id)}</span>
          </div>
        ) : mode === 'room' ? (
          <label className="field">
            Помещение
            <ChoiceSelect
              title="Помещение"
              value={roomId}
              options={roomOptions.map((option) => ({ value: option.id, label: option.label }))}
              onChange={setRoomId}
            />
          </label>
        ) : (
          <PlaceStepPicker state={state} value={singleId} onChange={setSingleId} />
        )}
        {mode === 'room' ? (
          <p className="muted">
            {nestedRoot
              ? `Метки на «${nestedRoot.name}» и все места в нём на любой глубине (полки, коробки): `
              : 'Метки на помещение и все места в нём на любой глубине (стеллажи, полки, коробки): '}
            {sourcePlaces.length}. На этикетке — QR-код, название места и путь к нему.
          </p>
        ) : (
          <LabelList title="Метки к печати" labels={labels} pathOf={parentPath} />
        )}
      </div>

      <div className="panel stack">
        <strong>Принтер</strong>
        <label className="field">
          Модель
          <ChoiceSelect
            title="Принтер"
            value={printer.id}
            options={PRINTERS.map((entry) => ({
              value: entry.id,
              label: entry.name,
              hint: entry.kind,
              group: entry.method === 'image' ? 'Через приложение принтера' : 'AirPrint — печать прямо из KeepIt',
            }))}
            onChange={choosePrinter}
          />
        </label>
        <span className="muted">{printer.kind}</span>
        {!isAirPrint ? (
          <label className="field">
            Размер этикетки
            <ChoiceSelect
              title="Размер этикетки"
              value={sizeIndex}
              options={printer.sizes.map((entry, index) => ({ value: index, label: sizeLabel(entry) }))}
              onChange={chooseSize}
            />
          </label>
        ) : null}
        {printer.method === 'airprint-a4' ? (
          <>
            <div className="stack-tight">
              <span className="field-caption">Формат бумаги</span>
              <div className="split-row">
                {PAPER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={sheet.paper === option.value ? undefined : 'secondary'}
                    aria-pressed={sheet.paper === option.value}
                    onClick={() => chooseSheet(sheetForPaper(sheet, option.value).id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stack-tight">
              <span className="field-caption">Этикеток на листе</span>
              {(['labels', 'half', 'plain'] as const).map((kind) => {
                const layouts = SHEET_LAYOUTS.filter((layout) => layout.paper === sheet.paper && layout.kind === kind)
                if (layouts.length === 0) return null
                return (
                  <div key={kind} className="stack-tight sheet-group">
                    <span className="muted">{SHEET_KIND_TITLE[kind]}</span>
                    <div className="chip-row">
                      {layouts.map((layout) => (
                        <button
                          key={layout.id}
                          type="button"
                          className={`suggest-chip sheet-chip${layout.id === sheet.id ? '' : ' neutral'}`}
                          aria-pressed={layout.id === sheet.id}
                          onClick={() => chooseSheet(layout.id)}
                        >
                          {labelsPerSheet(layout)}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              <span className="muted">{sheetLabel(sheet)}</span>
              {sheet.kind === 'half' ? (
                <span className="muted">
                  Лист этикеток A4 разрежьте поперёк пополам. Половинку кладите в лоток как A5 — линией разреза вниз
                  страницы. Сначала напечатайте пробу на обычной бумаге и приложите к листу на просвет.
                </span>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="stack-tight">
          <span className="field-caption">Текст на этикетке</span>
          <div className="split-row">
            {TEXT_PLACEMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={placement === option.value ? undefined : 'secondary'}
                aria-pressed={placement === option.value}
                onClick={() => choosePlacement(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <strong>Как печатать</strong>
        <ol className="print-steps">
          {printer.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => onMainClick('print')}
          disabled={printList.length === 0 || busy || (directPrint && !printReady)}
        >
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
            {pdfPurpose === 'print' ? 'Напечатать' : 'Сохранить PDF'}
          </button>
        ) : null}
        {isAirPrint && !directPrint ? (
          <p className="muted">
            На iPhone печать идёт через меню «Поделиться»: «Подготовить к печати» → «Напечатать» → в меню
            «Напечатать» — откроется окно AirPrint с выбором принтера.
          </p>
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
          <LabelList title="Метки к печати" labels={labels} pathOf={pathInRoom} />
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
                Свободные метки — заготовки для будущих коробок. Пустые места «Свободная метка» появятся в
                «{freeParentPath}» (одной строкой «Свободные метки» в списке), их метки напечатаются вместе с
                выбранными. Название задаётся при первом сканировании.
              </p>
              <label className="field">
                Сколько свободных меток
                <ChoiceSelect
                  title="Сколько свободных меток"
                  value={freeCount}
                  options={freeCountOptions}
                  onChange={setFreeCount}
                />
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

      {directPrint && printJob && printReady
        ? createPortal(
            <div className="print-root" aria-hidden>
              <style>{`@media print { @page { size: ${printJob.pageWidthMm}mm ${printJob.pageHeightMm}mm; margin: 0; } }`}</style>
              {printJob.pages.map((cells, pageIndex) => (
                <div
                  key={pageIndex}
                  className="print-page"
                  style={{ width: `${printJob.pageWidthMm}mm`, height: `${printJob.pageHeightMm}mm` }}
                >
                  {cells.map((cell) => (
                    <img
                      key={cell.id}
                      className={`print-label${printJob.cutLines ? ' cut' : ''}`}
                      src={cell.src}
                      alt=""
                      style={{ left: `${cell.x}mm`, top: `${cell.y}mm`, width: `${cell.w}mm`, height: `${cell.h}mm` }}
                    />
                  ))}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
