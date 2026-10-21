import { useEffect, useRef, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { parseItemIdFromScan, parsePlaceFromScan } from '../data/placeCodes'
import { getQrDetector } from '../data/qrDetector'
import { playScanSound } from '../data/scanSound'

function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function ScanScreen({ state }: { state: KeepItState }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const [manual, setManual] = useState('')
  const [message, setMessage] = useState<string | null>(null)
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

  /** true — код принят и камера закрыта; false — показали причину, сканирование продолжается */
  async function openPlace(raw: string): Promise<boolean> {
    const current = stateRef.current
    // Данные из памяти, без чтения базы: сигнал звучит сразу после распознавания
    const allPlaces = current.places
    // Метка вещи — открываем её карточку
    const itemId = parseItemIdFromScan(raw)
    if (itemId) {
      const item = current.findItem(itemId)
      if (!item) {
        playScanSound('fail')
        setMessage('Вещь по этой метке не найдена — возможно, она удалена.')
        return false
      }
      playScanSound('ok')
      releaseCamera()
      const itemPlace = allPlaces.find((entry) => entry.id === item.placeId)
      if (itemPlace && itemPlace.objectKey !== current.settings?.activeObject) {
        await current.setActiveObject(itemPlace.objectKey)
      }
      current.navigate({ name: 'item', itemId: item.id })
      return true
    }
    const place = parsePlaceFromScan(raw, allPlaces)
    if (!place) {
      playScanSound('fail')
      setMessage('Место не найдено. Проверьте код или выбранный объект хранения.')
      return false
    }
    playScanSound('ok')
    releaseCamera()
    if (place.objectKey !== current.settings?.activeObject) {
      await current.setActiveObject(place.objectKey)
    }
    current.navigate({ name: 'place', placeId: place.id })
    return true
  }

  useEffect(() => {
    let timer: number | undefined
    let cancelled = false

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Камера недоступна. Используйте ручной ввод кода.')
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
        let last: { raw: string; at: number } | null = null
        const tick = async () => {
          if (cancelled || !videoRef.current || !streamRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const value = codes[0]?.rawValue
            if (value) {
              // Неподходящий код, пока он перед камерой, повторно не проверяем — без серии сигналов
              const now = Date.now()
              const repeat = last && last.raw === value && now - last.at < 2000
              last = { raw: value, at: now }
              if (!repeat && (await openPlace(value))) return
            }
          } catch {
            /* keep scanning */
          }
          if (!cancelled) {
            timer = window.setTimeout(() => void tick(), 150)
          }
        }
        void tick()
      } catch {
        if (!cancelled) {
          setCameraError('Нет доступа к камере. Введите код вручную.')
        }
      }
    }

    void openCamera()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      const video = videoRef.current
      if (video) {
        video.pause()
        video.srcObject = null
      }
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [])

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Сканировать место</strong>
        <video ref={videoRef} className="scanner-video" muted playsInline />
        {cameraError ? <p className="muted">{cameraError}</p> : null}
      </div>

      <div className="panel stack">
        <strong>Ручной ввод кода</strong>
        <label className="field">
          Код места или ссылка из QR
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Дача / Каменный гараж / … или ссылка QR"
          />
        </label>
        {message ? <p className="error">{message}</p> : null}
        <button type="button" onClick={() => void openPlace(manual)} disabled={!manual.trim()}>
          Открыть место
        </button>
      </div>
    </div>
  )
}
