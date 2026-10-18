import { useEffect, useRef, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { parsePlaceFromScan } from '../data/placeCodes'
import { getQrDetector } from '../data/qrDetector'
import { listPlaces } from '../data/repository'

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

  async function openPlace(raw: string) {
    const current = stateRef.current
    const allPlaces = await listPlaces()
    const place = parsePlaceFromScan(raw, allPlaces)
    if (!place) {
      setMessage('Место не найдено. Проверьте код или выбранный объект хранения.')
      return
    }
    releaseCamera()
    if (place.objectKey !== current.settings?.activeObject) {
      await current.setActiveObject(place.objectKey)
    }
    current.navigate({ name: 'place', placeId: place.id })
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
        const tick = async () => {
          if (cancelled || !videoRef.current || !streamRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const value = codes[0]?.rawValue
            if (value) {
              await openPlace(value)
              return
            }
          } catch {
            /* keep scanning */
          }
          if (!cancelled) {
            timer = window.setTimeout(() => void tick(), 350)
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
