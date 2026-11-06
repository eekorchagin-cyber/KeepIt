import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { PlaceStepPicker } from '../components/PlaceStepPicker'
import { ChoiceSelect } from '../components/ChoiceSelect'
import type { KeepItState } from '../hooks/useKeepIt'
import { itemUrl, placeUrl } from '../data/placeCodes'
import { canHoldFreeLabels } from '../data/repository'
import { renderLabelDataUrl, renderLabelPng, safeFileName, shareFiles, shareLabelImages } from '../data/labelImage'
import { LABEL_DOTS_PER_MM, renderLabelsPdf } from '../data/labelPdf'
import {
  DEFAULT_FORMAT_ID,
  LABEL_FORMATS,
  PAPER_OPTIONS,
  TAPE_LABEL,
  TEXT_PLACEMENT_OPTIONS,
  LABEL_COUNTS,
  findFormat,
  formatBrands,
  formatSize,
  formatsWithCount,
  labelsPerA4,
  hasCutLines,
  labelsPerSheet,
  sheetLabel,
  sheetLayout,
  sheetPages,
  sheetPaper,
  type PaperSize,
  type TextPlacement,
} from '../data/labelSheets'
import {
  DEFAULT_PRINTER_ID,
  PRINTERS,
  findPrinter,
  isNiimbotPrinter,
  openNiimbotApp,
  sizeLabel,
  type LabelSize,
} from '../data/printers'
import type { Place } from '../types'

const FREE_LABEL_COUNTS = [6, 12, 24]
const PRINTER_KEY = 'keepit-printer'
const SIZE_KEY = 'keepit-label-size'
/** Прежний выбор листа (до единых размеров) — для переноса настройки */
const LEGACY_SHEET_KEY = 'keepit-a4-sheet'
const FORMAT_KEY = 'keepit-label-format'
const PAPER_KEY = 'keepit-label-paper'
const CUT_KEY = 'keepit-label-cut'
const PLACEMENT_KEY = 'keepit-label-text'
const TRAY_KEY = 'keepit-printer-tray'
/** В режиме «Одно место»: показывать вещи для печати их QR */
const INCLUDE_ITEMS_KEY = 'keepit-print-include-items'

/** Размер этикетки, бумага и линии разреза: сохранённые или перенесённые из прежнего выбора листа */
function initialSheetChoice(): { formatId: string; paper: PaperSize; cutLines: boolean } {
  const stored = readStored(FORMAT_KEY)
  if (stored) {
    return {
      formatId: findFormat(stored).id,
      paper: readStored(PAPER_KEY) === 'A5' ? 'A5' : 'A4',
      cutLines: readStored(CUT_KEY) !== '0',
    }
  }
  const legacy = readStored(LEGACY_SHEET_KEY) ?? ''
  if (legacy.startsWith('a4-')) return { formatId: findFormat(legacy).id, paper: 'A4', cutLines: false }
  const half = /^a5-half-(\d+)$/.exec(legacy)?.[1]
  if (half) {
    const format = LABEL_FORMATS.find((entry) => labelsPerA4(entry) === Number(half) * 2)
    return { formatId: format?.id ?? DEFAULT_FORMAT_ID, paper: 'A5', cutLines: false }
  }
  return { formatId: DEFAULT_FORMAT_ID, paper: legacy.startsWith('a5-') ? 'A5' : 'A4', cutLines: true }
}

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

/** Одна метка к печати: место или вещь — одинаковый QR/PDF/картинка */
type LabelSpec = { id: string; name: string; url: string; path: string }
type LabelView = LabelSpec & { qrDataUrl: string }
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

/** Список меток: название, путь и QR-код. */
function LabelList({ title, labels }: { title: string; labels: LabelView[] }) {
  return (
    <div className="stack">
      <strong>{title}</strong>
      {labels.length === 0 ? <span className="muted">Выберите место или вещь</span> : null}
      <div className="list">
        {labels.map((label) => (
          <div key={label.id} className="list-item">
            <span className="stack-tight">
              <strong>{label.name}</strong>
              {label.path ? <span className="place-code muted">{label.path}</span> : null}
            </span>
            <img src={label.qrDataUrl} alt="" width={56} height={56} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PrintLabelsScreen({
  state,
  placeId,
  itemId,
}: {
  state: KeepItState
  placeId?: string
  /** Печать QR этой вещи — те же параметры принтера, что из «Действия → Печать меток» */
  itemId?: string
}) {
  const startItem = itemId
    ? (state.findItem(itemId) ?? state.allItems.find((entry) => entry.id === itemId))
    : undefined
  const startId =
    startItem?.placeId ?? placeId ?? state.places.find((place) => place.type === 'object')?.id ?? ''
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
  const nestedRoot = !startItem && start && !isRoomLike(start) ? start : undefined

  const [mode, setMode] = useState<PrintMode>(() =>
    startItem
      ? 'single'
      : !start || isRoomLike(start) || state.childPlaces(start.id).length > 0
        ? 'room'
        : 'single',
  )
  const [roomId, setRoomId] = useState(() => (nestedRoot ? nestedRoot.id : startId ? roomOf(startId) : ''))
  const [singleId, setSingleId] = useState(startId)
  /** Если задано — печатаем QR вещи, а не места */
  const [singleItemId, setSingleItemId] = useState<string | null>(() => startItem?.id ?? null)
  const [includeItems, setIncludeItems] = useState(
    () => Boolean(startItem) || readStored(INCLUDE_ITEMS_KEY) === '1',
  )
  /** Пока true — полный выбор «что печатать»; после выбора остаётся сводка, метки и принтер */
  const [picking, setPicking] = useState(() => !(nestedRoot || startItem))
  const [printerId, setPrinterId] = useState(() => findPrinter(readStored(PRINTER_KEY) ?? DEFAULT_PRINTER_ID).id)
  /** Живой прообраз этикетки при смене «Справа от QR» / «Под QR» */
  const [layoutPreview, setLayoutPreview] = useState<string | null>(null)
  const [sizeIndex, setSizeIndex] = useState(() => Number(readStored(SIZE_KEY) ?? 0) || 0)
  const [sheetChoice, setSheetChoice] = useState(initialSheetChoice)
  const [trayId, setTrayId] = useState(() => readStored(TRAY_KEY) ?? '1')
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
  /** После сохранения картинок для NIIMBOT — спросить, открыть ли приложение */
  const [askNiimbot, setAskNiimbot] = useState(false)
  const [freeCount, setFreeCount] = useState(12)
  /** Свободные метки, созданные перед печатью — печатаются вместе с выбранными местами */
  const [extraPlaces, setExtraPlaces] = useState<Place[]>([])

  const printer = findPrinter(printerId)
  const size: LabelSize = printer.sizes[sizeIndex] ?? printer.sizes[0]!
  const isAirPrint = printer.method !== 'image'
  /** Печать через системное окно браузера (компьютер); на iPhone — через PDF и «Поделиться» */
  const directPrint = isAirPrint && !PRINT_VIA_SHARE
  const sheet = sheetLayout(findFormat(sheetChoice.formatId), sheetChoice.paper, sheetChoice.cutLines)
  const tray = printer.trays?.find((entry) => entry.id === trayId) ?? printer.trays?.[0]

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
  /** Путь к месту без его названия: «Дача / Каменный гараж» — печатается на метке под названием */
  function parentPath(id: string): string {
    return state
      .pathFor(id)
      .slice(0, -1)
      .map((part) => part.name)
      .join(' / ')
  }

  /** Полный путь места: «Дача / Баня / Комната отдыха» */
  function fullPath(id: string): string {
    return state
      .pathFor(id)
      .map((part) => part.name)
      .join(' / ')
  }

  function placeLabel(place: Place): LabelSpec {
    return { id: place.id, name: place.name, url: placeUrl(place.id), path: parentPath(place.id) }
  }

  const sourceLabels = useMemo((): LabelSpec[] => {
    if (mode === 'single') {
      if (singleItemId) {
        const item = state.findItem(singleItemId) ?? state.allItems.find((entry) => entry.id === singleItemId)
        if (!item) return []
        return [{ id: item.id, name: item.name, url: itemUrl(item.id), path: fullPath(item.placeId) }]
      }
      const one = state.findPlace(singleId)
      return one ? [placeLabel(one)] : []
    }
    const root = state.findPlace(roomId)
    if (!root) return []
    const result: LabelSpec[] = []
    const visit = (place: Place) => {
      result.push(placeLabel(place))
      for (const child of state.childPlaces(place.id)) visit(child)
    }
    visit(root)
    return result
    // placeLabel/fullPath зависят только от state.places
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roomId, singleId, singleItemId, state])

  const printList = useMemo(() => {
    const seen = new Set(sourceLabels.map((label) => label.id))
    const extras = extraPlaces
      .filter((place) => !seen.has(place.id))
      .map((place) => placeLabel(place))
    return [...sourceLabels, ...extras]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLabels, extraPlaces, state.places])

  function labelSetKey(list: LabelSpec[]): string {
    return `${printer.id}:${sheet.id}:${placement}:${list
      .map((label) => label.id)
      .sort()
      .join(',')}`
  }
  const pdf = pdfResult && pdfResult.key === labelSetKey(printList) ? pdfResult.file : null
  const pdfPurpose = pdfResult?.purpose ?? 'save'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const prepared = await Promise.all(
        printList.map(async (label) => ({
          ...label,
          qrDataUrl: await QRCode.toDataURL(label.url, {
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
  async function buildPrintJob(list: LabelSpec[], isCancelled: () => boolean): Promise<PrintJob | null> {
    const tape = printer.method === 'airprint-tape'
    const size = tape ? TAPE_LABEL : sheet
    const sources: string[] = []
    for (let index = 0; index < list.length; index += 1) {
      if (index > 0 && index % 8 === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 0))
        if (isCancelled()) return null
      }
      const label = list[index]!
      sources.push(renderLabelDataUrl(label.name, label.url, size, LABEL_DOTS_PER_MM, label.path, placement))
    }
    const key = labelSetKey(list)
    if (tape) {
      return {
        key,
        pageWidthMm: TAPE_LABEL.widthMm,
        pageHeightMm: TAPE_LABEL.heightMm,
        cutLines: false,
        pages: list.map((label, index) => [
          { id: label.id, src: sources[index]!, x: 0, y: 0, w: TAPE_LABEL.widthMm, h: TAPE_LABEL.heightMm },
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
  async function output(list: LabelSpec[], target: OutputTarget) {
    setBusy(true)
    setError(null)
    try {
      if (isAirPrint && (target === 'pdf' || !directPrint)) {
        const purpose = target === 'print' ? 'print' : 'save'
        const blob = await renderLabelsPdf(
          list.map((label) => ({ name: label.name, url: label.url, path: label.path })),
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
        list.map(async (label) => {
          const blob = await renderLabelPng(label.name, label.url, size, printer.dotsPerMm, label.path, placement)
          return { id: label.id, name: label.name, blob, previewUrl: URL.createObjectURL(blob) }
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

  function chooseSheet(patch: Partial<{ formatId: string; paper: PaperSize; cutLines: boolean }>) {
    const next = { ...sheetChoice, ...patch }
    // Этикетка на весь лист A4 на A5 не помещается — берём половину листа
    if (labelsPerSheet(sheetLayout(findFormat(next.formatId), next.paper, next.cutLines)) === 0) {
      next.formatId = '210x148-2'
    }
    setSheetChoice(next)
    setPdf(null)
    setMessage(null)
    writeStored(FORMAT_KEY, next.formatId)
    writeStored(PAPER_KEY, next.paper)
    writeStored(CUT_KEY, next.cutLines ? '1' : '0')
  }

  function chooseTray(id: string) {
    setTrayId(id)
    writeStored(TRAY_KEY, id)
  }

  function choosePlacement(next: TextPlacement) {
    setPlacement(next)
    setImages([])
    setPdf(null)
    setMessage(null)
    writeStored(PLACEMENT_KEY, next)
  }

  function confirmSelection() {
    if (mode === 'single' && !singleId && !singleItemId) return
    if (mode === 'room' && !roomId && !nestedRoot) return
    setPicking(false)
  }

  function reopenSelection() {
    setPicking(true)
  }

  const selectionTitle = (() => {
    if (mode === 'single' && singleItemId) {
      const item = state.findItem(singleItemId) ?? state.allItems.find((entry) => entry.id === singleItemId)
      return item ? `Вещь «${item.name}»` : 'Вещь'
    }
    if (mode === 'single') {
      const place = state.findPlace(singleId)
      return place ? `Место «${place.name}»` : 'Место'
    }
    if (nestedRoot) return `«${nestedRoot.name}» и вложенные места`
    const room = state.findPlace(roomId)
    return room ? `Помещение «${room.name}»` : 'Помещение'
  })()

  const selectionHint = (() => {
    if (mode === 'single' && singleItemId) {
      const item = state.findItem(singleItemId) ?? state.allItems.find((entry) => entry.id === singleItemId)
      return item ? fullPath(item.placeId) : ''
    }
    if (mode === 'single' && singleId) return parentPath(singleId) || fullPath(singleId)
    if (nestedRoot) return parentPath(nestedRoot.id)
    if (roomId) return parentPath(roomId)
    return ''
  })()

  /** Размер одной этикетки для прообраза — как при печати */
  const previewSize: LabelSize =
    printer.method === 'airprint-tape'
      ? TAPE_LABEL
      : printer.method === 'airprint-a4'
        ? { widthMm: sheet.format.widthMm, heightMm: sheet.format.heightMm }
        : size

  useEffect(() => {
    if (picking || printList.length === 0) {
      setLayoutPreview(null)
      return
    }
    const first = printList[0]!
    try {
      setLayoutPreview(
        renderLabelDataUrl(first.name, first.url, previewSize, LABEL_DOTS_PER_MM, first.path, placement),
      )
    } catch {
      setLayoutPreview(null)
    }
  }, [picking, printList, previewSize.widthMm, previewSize.heightMm, placement])

  function chooseSize(index: number) {
    setSizeIndex(index)
    setImages([])
    setMessage(null)
    writeStored(SIZE_KEY, String(index))
  }

  /** Куда класть свободные метки: выбранное помещение или помещение выбранного места/вещи. */
  const freeAnchorId = (() => {
    if (mode === 'room') return roomId
    if (singleItemId) {
      const item = state.findItem(singleItemId) ?? state.allItems.find((entry) => entry.id === singleItemId)
      return item ? roomOf(item.placeId) : ''
    }
    return singleId ? roomOf(singleId) : ''
  })()
  const freeParent = state.findPlace(freeAnchorId)
  // Не во весь объект: иначе заготовки встают в один ряд с помещениями; для вещи свободные метки не предлагаем
  const canCreateFree = Boolean(freeParent && canHoldFreeLabels(freeParent.type) && !singleItemId)
  /** Сколько этикеток останется пустыми на последнем листе A4 — их удобно занять свободными метками */
  const sheetRemainder =
    printer.method === 'airprint-a4' && printList.length > 0 && sheet.cols * sheet.rows > 0
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
      const seen = new Set(printList.map((label) => label.id))
      const full = [...printList, ...created.filter((place) => !seen.has(place.id)).map((place) => placeLabel(place))]
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
      if (result === 'cancelled') {
        setMessage(null)
        return
      }
      setMessage(
        result === 'shared'
          ? 'Картинки переданы. Теперь откройте приложение принтера и напечатайте их (шаги выше).'
          : 'Картинки скачаны. Откройте их в приложении принтера (шаги выше).',
      )
      if (isNiimbotPrinter(printer)) setAskNiimbot(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить картинки')
    }
  }

  async function savePdf() {
    if (!pdf) return
    setError(null)
    try {
      const result = await shareFiles([pdf])
      if (result === 'cancelled') {
        setMessage(null)
        return
      }
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
      {picking ? (
        <div className="panel stack">
          <strong>Что печатать</strong>
          <div className="split-row">
            <button
              type="button"
              className={mode === 'room' ? undefined : 'secondary'}
              onClick={() => {
                setMode('room')
                setSingleItemId(null)
                setPicking(!nestedRoot)
              }}
            >
              {nestedRoot ? 'Все вложенные места хранения' : 'Все места в помещении'}
            </button>
            <button
              type="button"
              className={mode === 'single' ? undefined : 'secondary'}
              onClick={() => {
                setMode('single')
                setPicking(true)
              }}
            >
              Одно место или вещь
            </button>
          </div>
          {mode === 'room' && nestedRoot ? (
            <div className="stack-tight">
              <strong>{nestedRoot.name}</strong>
              <span className="place-code muted">{parentPath(nestedRoot.id)}</span>
              <button type="button" onClick={confirmSelection}>
                Готово — к печати ({sourceLabels.length})
              </button>
            </div>
          ) : mode === 'room' ? (
            <>
              <label className="field">
                Помещение
                <ChoiceSelect
                  title="Помещение"
                  value={roomId}
                  options={roomOptions.map((option) => ({ value: option.id, label: option.label }))}
                  onChange={(id) => {
                    setRoomId(id)
                    setPicking(false)
                  }}
                />
              </label>
              {roomId ? (
                <button type="button" onClick={confirmSelection}>
                  Готово — к печати ({sourceLabels.length})
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="split-row">
                <button
                  type="button"
                  className={includeItems ? undefined : 'secondary'}
                  aria-pressed={includeItems}
                  onClick={() => {
                    setIncludeItems(true)
                    writeStored(INCLUDE_ITEMS_KEY, '1')
                  }}
                >
                  С вещами
                </button>
                <button
                  type="button"
                  className={!includeItems ? undefined : 'secondary'}
                  aria-pressed={!includeItems}
                  onClick={() => {
                    setIncludeItems(false)
                    setSingleItemId(null)
                    writeStored(INCLUDE_ITEMS_KEY, '0')
                  }}
                >
                  Только места
                </button>
              </div>
              <PlaceStepPicker
                state={state}
                placeId={singleId}
                itemId={includeItems ? singleItemId : null}
                includeItems={includeItems}
                onSelectPlace={(id) => {
                  setSingleId(id)
                  setSingleItemId(null)
                  if (id && !includeItems && state.childPlaces(id).length === 0) setPicking(false)
                }}
                onSelectItem={(id) => {
                  const item = state.findItem(id) ?? state.allItems.find((entry) => entry.id === id)
                  if (!item) return
                  setSingleId(item.placeId)
                  setSingleItemId(item.id)
                  setPicking(false)
                }}
              />
              {singleId || singleItemId ? (
                <button type="button" className="secondary" onClick={confirmSelection}>
                  Готово — печатать {singleItemId ? 'эту вещь' : 'это место'}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="panel stack">
          <div className="row">
            <div className="stack-tight grow">
              <strong>{selectionTitle}</strong>
              {selectionHint ? <span className="place-code muted">{selectionHint}</span> : null}
              <span className="muted">Меток: {printList.length}</span>
            </div>
            <button type="button" className="secondary" onClick={reopenSelection}>
              Изменить
            </button>
          </div>
        </div>
      )}

      {!picking && printList.length > 0 ? (
        <div className="panel stack">
          <LabelList title="Метки к печати" labels={labels} />
        </div>
      ) : null}

      {!picking ? (
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
                    onClick={() => chooseSheet({ paper: option.value })}
                  >
                    {option.label} · {option.hint}
                  </button>
                ))}
              </div>
            </div>
            <div className="stack-tight">
              <span className="field-caption">
                Этикеток на листе A4 — StickWell, Rillprint, Mega Label, Index Label, Apli
                {sheet.paper === 'A5' ? ' (на A5 — половина)' : ''}
              </span>
              <div className="chip-row">
                {LABEL_COUNTS.map((count) => {
                  const options = formatsWithCount(count).filter(
                    (format) => labelsPerSheet(sheetLayout(format, sheet.paper, sheet.cutLines)) > 0,
                  )
                  if (options.length === 0) return null
                  const selected = labelsPerA4(sheet.format) === count
                  return (
                    <button
                      key={count}
                      type="button"
                      className={`suggest-chip sheet-chip${selected ? '' : ' neutral'}`}
                      aria-pressed={selected}
                      onClick={() => chooseSheet({ formatId: options[0]!.id })}
                    >
                      {count}
                    </button>
                  )
                })}
              </div>
              {formatsWithCount(labelsPerA4(sheet.format)).length > 1 ? (
                <>
                  <span className="field-caption">Размер этикетки</span>
                  <div className="chip-row">
                    {formatsWithCount(labelsPerA4(sheet.format)).map((format) => {
                      const selected = format.id === sheet.format.id
                      return (
                        <button
                          key={format.id}
                          type="button"
                          className={`suggest-chip sheet-chip${selected ? '' : ' neutral'}`}
                          aria-pressed={selected}
                          onClick={() => chooseSheet({ formatId: format.id })}
                        >
                          {formatSize(format)}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
              <span className="muted">{sheetLabel(sheet)}</span>
              <span className="muted">Такие листы: {formatBrands(sheet.format)}</span>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={sheet.cutLines}
                  onChange={(event) => chooseSheet({ cutLines: event.target.checked })}
                />
                <span>Бумага без прорезей — напечатать линии разреза</span>
              </label>
              {sheet.paper === 'A5' ? (
                <span className="muted">
                  A5 — половина листа A4: лист этикеток разрежьте поперёк пополам и кладите половинку в лоток как A5,
                  линией разреза вниз страницы. Сначала напечатайте пробу на обычной бумаге и приложите к листу на
                  просвет.
                </span>
              ) : null}
            </div>
            {tray ? (
              <div className="stack-tight">
                <span className="field-caption">Лоток принтера</span>
                <div className="split-row">
                  {printer.trays!.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={option.id === tray.id ? undefined : 'secondary'}
                      aria-pressed={option.id === tray.id}
                      onClick={() => chooseTray(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="muted">Лоток {tray.label}: {tray.hint}.</span>
                {!tray.labels && !sheet.cutLines ? (
                  <p className="place-type-warning">
                    Листы этикеток этот принтер подаёт только из лотка 1 (верхнего). Выберите лоток 1 — или печатайте
                    на обычной бумаге с линиями разреза.
                  </p>
                ) : null}
                <span className="muted">
                  {PRINT_VIA_SHARE
                    ? `На iPhone лоток в окне печати не выбирается — принтер берёт бумагу из лотка, где лежит лист нужного формата. Чтобы печать пошла из лотка ${tray.id}, на время печати ${tray.id === '1' ? 'выдвиньте нижний лоток 2' : 'уберите бумагу из верхнего лотка 1'}.`
                    : `KeepIt не выбирает лоток сам. В окне печати Chrome нажмите «Печать с помощью системного диалогового окна» (⌥⌘P), затем «Подробнее» → «Подача бумаги» → «Лоток ${tray.id}»${tray.labels && !sheet.cutLines ? ', а в «Носитель и качество» → «Тип носителя» — «Этикетки»' : ''}. В Safari системное окно открывается сразу.`}
                </span>
              </div>
            ) : null}
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
          {layoutPreview ? (
            <div className="stack-tight label-layout-preview">
              <span className="muted">Прообраз печати</span>
              <img
                src={layoutPreview}
                alt={`Прообраз метки, текст ${placement === 'below' ? 'под' : 'справа от'} QR`}
                className="label-layout-preview-img"
              />
            </div>
          ) : null}
        </div>

        <strong>Как печатать</strong>
        <ol className="print-steps">
          {printer.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        {printer.trays ? (
          <p className="place-type-warning print-tray-hint">
            В вашем принтере печать на самоклеящейся бумаге производится из верхнего лотка. Настройте тип бумаги в нём
            через меню принтера и выдвиньте на время нижний лоток.
          </p>
        ) : null}

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
      ) : null}

      {images.length > 0 ? (
        <div className="panel stack">
          <strong>Метки-картинки · {sizeLabel(size)}</strong>
          <div className="label-previews">
            {images.map((image) => (
              <img key={image.id} src={image.previewUrl} alt={image.name} />
            ))}
          </div>
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

      {askNiimbot ? (
        <div className="sheet-backdrop" onClick={() => setAskNiimbot(false)} role="presentation">
          <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
            <div className="row">
              <strong className="grow">Запустить NIIMBOT?</strong>
              <button type="button" className="icon-btn" onClick={() => setAskNiimbot(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="stack">
              <p className="muted">
                Картинки сохранены. Откройте приложение NIIMBOT, создайте этикетку того же размера и вставьте
                сохранённое изображение — затем напечатайте.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAskNiimbot(false)
                  openNiimbotApp()
                }}
              >
                Да, запустить NIIMBOT
              </button>
              <button type="button" className="secondary" onClick={() => setAskNiimbot(false)}>
                Нет, остаться на печати меток
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
