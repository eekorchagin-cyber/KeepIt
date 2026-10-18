import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { ObjectBadge } from './ObjectBadge'
import { rootObjects } from '../data/icons'
import { parsePlaceFromScan } from '../data/placeCodes'
import { getQrDetector } from '../data/qrDetector'
import { listPlaces, movesWithContents } from '../data/repository'
import type { Place } from '../types'

function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

function objectRoots(places: Place[]): Place[] {
  return rootObjects(places)
}

function descendantIds(placeId: string, places: Place[]): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => {
    for (const child of places.filter((place) => place.parentId === id)) {
      ids.add(child.id)
      visit(child.id)
    }
  }
  visit(placeId)
  return ids
}

export function MoveItemSheet({
  state,
  itemId,
  onClose,
}: {
  state: KeepItState
  itemId: string
  onClose: () => void
}) {
  const item = state.findItem(itemId)
  if (!item) {
    return (
      <Sheet title="Перенести" onClose={onClose}>
        <p>Вещь не найдена</p>
      </Sheet>
    )
  }

  return (
    <PlaceTargetSheet
      state={state}
      title="Перенести"
      subjectLabel={`«${item.name}»`}
      currentPlaceId={item.placeId}
      blockedIds={new Set()}
      confirmLabel={(place) => `Перенести сюда: ${place.name}`}
      alreadyHereLabel="Уже здесь"
      onConfirm={async (placeId) => {
        const moved = await state.relocateItem(item.id, placeId)
        const target = state.findPlace(placeId)
        if (target && target.objectKey !== state.settings?.activeObject) {
          await state.setActiveObject(target.objectKey)
        }
        onClose()
        state.navigate({ name: 'item', itemId: moved.id })
      }}
      onClose={onClose}
    />
  )
}

export function MovePlaceSheet({
  state,
  placeId,
  onClose,
}: {
  state: KeepItState
  placeId: string
  onClose: () => void
}) {
  const place = state.findPlace(placeId)
  const blocked = useMemo(() => {
    const ids = descendantIds(placeId, state.places)
    ids.add(placeId)
    return ids
  }, [placeId, state.places])

  if (!place) {
    return (
      <Sheet title="Перенести место" onClose={onClose}>
        <p>Место не найдено</p>
      </Sheet>
    )
  }

  if (place.type === 'object') {
    return (
      <Sheet title="Перенести место" onClose={onClose}>
        <p>Корневой объект нельзя перенести.</p>
        <button type="button" onClick={onClose}>
          Закрыть
        </button>
      </Sheet>
    )
  }

  const withContents = movesWithContents(place.type)
  const stock = state.stockInSubtree(place.id)
  const subjectLabel = withContents
    ? `«${place.name}» переедет вместе со всем содержимым${stock.itemCount > 0 ? ` (${stock.itemCount})` : ''}`
    : `«${place.name}» → внутрь выбранного места. Если есть содержимое — сначала перенесите его (или используйте коробку/контейнер).`

  return (
    <PlaceTargetSheet
      state={state}
      title={withContents ? 'Перенести с содержимым' : 'Перенести место'}
      subjectLabel={subjectLabel}
      currentPlaceId={place.parentId}
      blockedIds={blocked}
      confirmLabel={(target) =>
        withContents ? `Перенести сюда с содержимым: ${target.name}` : `Перенести сюда: ${target.name}`
      }
      alreadyHereLabel="Уже здесь"
      onConfirm={async (parentId) => {
        const moved = await state.relocatePlace(place.id, parentId)
        if (moved.objectKey !== state.settings?.activeObject) {
          await state.setActiveObject(moved.objectKey)
        }
        onClose()
        state.navigate({ name: 'place', placeId: moved.id })
      }}
      onClose={onClose}
    />
  )
}

function PlaceTargetSheet({
  state,
  title,
  subjectLabel,
  currentPlaceId,
  blockedIds,
  confirmLabel,
  alreadyHereLabel,
  onConfirm,
  onClose,
}: {
  state: KeepItState
  title: string
  subjectLabel: string
  /** Место, которое считается «уже здесь» (для вещи — текущее; для места — текущий родитель). */
  currentPlaceId: string | null
  blockedIds: Set<string>
  confirmLabel: (place: Place) => string
  alreadyHereLabel: string
  onConfirm: (placeId: string) => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'browse' | 'scan'>('browse')
  const [browseId, setBrowseId] = useState<string | null>(null)

  const roots = useMemo(() => objectRoots(state.places), [state.places])
  const current = browseId ? state.findPlace(browseId) : null
  const path = current ? state.pathFor(current.id) : []
  const children = (current ? state.childPlaces(current.id) : roots).filter(
    (place) => !blockedIds.has(place.id),
  )
  const isCurrentPlace = Boolean(current && current.id === currentPlaceId)
  const canConfirmHere = Boolean(current && !blockedIds.has(current.id) && !isCurrentPlace)

  async function onMove(placeId: string) {
    if (blockedIds.has(placeId)) {
      setError('Сюда перенести нельзя')
      return
    }
    const target = state.findPlace(placeId) ?? (await listPlaces()).find((place) => place.id === placeId)
    if (!target) {
      setError('Место не найдено')
      return
    }
    if (target.id === currentPlaceId) {
      setError(alreadyHereLabel)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(target.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось перенести')
    } finally {
      setBusy(false)
    }
  }

  function goUp() {
    if (!current) return
    setBrowseId(current.parentId)
    setError(null)
  }

  function openPlace(place: Place) {
    setBrowseId(place.id)
    setError(null)
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted">{subjectLabel}</p>

      <div className="row wrap">
        <button
          type="button"
          className={mode === 'browse' ? undefined : 'secondary'}
          disabled={busy}
          onClick={() => {
            setMode('browse')
            setError(null)
          }}
        >
          По шагам
        </button>
        <button
          type="button"
          className={mode === 'scan' ? undefined : 'secondary'}
          disabled={busy}
          onClick={() => {
            setMode('scan')
            setError(null)
          }}
        >
          Сканировать QR
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {mode === 'scan' ? (
        <MoveQrScan
          busy={busy}
          onResolved={(placeId) => void onMove(placeId)}
          onFail={(message) => setError(message)}
        />
      ) : (
        <>
          <div className="move-crumbs">
            <button type="button" className="ghost crumb" disabled={!current} onClick={goUp}>
              ← Назад
            </button>
            <div className="move-crumb-path">
              {current ? path.map((part) => part.name).join(' → ') : 'Выберите объект'}
            </div>
          </div>

          {current ? (
            <button type="button" disabled={busy || !canConfirmHere} onClick={() => void onMove(current.id)}>
              {isCurrentPlace ? alreadyHereLabel : confirmLabel(current)}
            </button>
          ) : null}

          <div className="list move-list">
            {children.length === 0 ? (
              <p className="muted">
                {current
                  ? 'Вложенных мест нет — можно перенести сюда кнопкой выше'
                  : 'Нет доступных объектов'}
              </p>
            ) : null}
            {children.map((place) => {
              const nested = state.childPlaces(place.id).filter((child) => !blockedIds.has(child.id)).length
              const here = place.id === currentPlaceId
              return (
                <button
                  key={place.id}
                  type="button"
                  className="list-item move-item"
                  disabled={busy}
                  onClick={() => openPlace(place)}
                >
                  <span className="list-item-main">
                    {place.type === 'object' ? <ObjectBadge place={place} size="sm" /> : null}
                    <span className="move-step">
                      <strong>{place.name}</strong>
                      <span className="muted">
                        {here ? 'сейчас здесь · ' : ''}
                        {nested > 0 ? `внутри: ${nested}` : 'открыть / выбрать'}
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Sheet>
  )
}

function MoveQrScan({
  busy,
  onResolved,
  onFail,
}: {
  busy: boolean
  onResolved: (placeId: string) => void
  onFail: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const handledRef = useRef(false)
  const [manual, setManual] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)

  function releaseCamera() {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    stopStream(streamRef.current)
    streamRef.current = null
  }

  async function resolveRaw(raw: string) {
    if (handledRef.current || busy) return
    const places = await listPlaces()
    const place = parsePlaceFromScan(raw, places)
    if (!place) {
      onFail('Место по QR не найдено. Проверьте метку или введите путь вручную.')
      return
    }
    handledRef.current = true
    releaseCamera()
    onResolved(place.id)
  }

  useEffect(() => {
    let timer: number | undefined
    let cancelled = false
    handledRef.current = false

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Камера недоступна — введите код места вручную.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stopStream(stream)
          streamRef.current = null
          return
        }
        video.srcObject = stream
        await video.play()

        const detector = getQrDetector()
        const tick = async () => {
          if (cancelled || handledRef.current || !videoRef.current || !streamRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const value = codes[0]?.rawValue
            if (value) {
              await resolveRaw(value)
              return
            }
          } catch {
            /* keep scanning */
          }
          if (!cancelled && !handledRef.current) {
            timer = window.setTimeout(() => void tick(), 350)
          }
        }
        void tick()
      } catch {
        if (!cancelled) {
          setCameraError('Нет доступа к камере — введите код места вручную.')
        }
      }
    }

    void openCamera()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      releaseCamera()
    }
  }, [])

  return (
    <div className="stack">
      <p className="muted">Наведите камеру на QR нового места хранения</p>
      <video ref={videoRef} className="scanner-video move-scan-video" muted playsInline />
      {cameraError ? <p className="muted">{cameraError}</p> : null}
      <label className="field">
        Или введите код / путь
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder="Дача / Каменный гараж / …"
          disabled={busy}
        />
      </label>
      <button type="button" disabled={busy || !manual.trim()} onClick={() => void resolveRaw(manual)}>
        Перенести по коду
      </button>
    </div>
  )
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet sheet-tall" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
        <div className="row">
          <strong className="grow">{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="stack">{children}</div>
      </div>
    </div>
  )
}
