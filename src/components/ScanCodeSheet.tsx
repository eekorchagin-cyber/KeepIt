import { useEffect, useRef, useState } from 'react'
import { getQrDetector } from '../data/qrDetector'
import { playScanSound, scanSoundEnabled, setScanSoundEnabled } from '../data/scanSound'

function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

/**
 * Лист: считать QR или линейный штрихкод камерой / ввести вручную и вернуть сырое значение.
 * Не ищет вещь или место — только захватывает код для присвоения.
 */
export function ScanCodeSheet({
  title = 'Штрих-код или QR',
  hint = 'Наведите камеру на заводской штрихкод или QR на вещи — или введите код вручную.',
  onCapture,
  onClose,
}: {
  title?: string
  hint?: string
  onCapture: (raw: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const handledRef = useRef(false)
  const lastScanRef = useRef<{ raw: string; at: number } | null>(null)
  const [manual, setManual] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [sound, setSound] = useState(scanSoundEnabled)

  function releaseCamera() {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    stopStream(streamRef.current)
    streamRef.current = null
  }

  function accept(raw: string) {
    const value = raw.trim()
    if (!value || handledRef.current) return
    handledRef.current = true
    playScanSound('ok')
    releaseCamera()
    onCapture(value)
  }

  useEffect(() => {
    let timer: number | undefined
    let cancelled = false
    handledRef.current = false

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Камера недоступна — введите код вручную.')
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
            const value = codes[0]?.rawValue?.trim()
            if (value) {
              const now = Date.now()
              const last = lastScanRef.current
              lastScanRef.current = { raw: value, at: now }
              if (!(last && last.raw === value && now - last.at < 1200)) accept(value)
            }
          } catch {
            /* keep scanning */
          }
          if (!cancelled && !handledRef.current) {
            timer = window.setTimeout(() => void tick(), 150)
          }
        }
        void tick()
      } catch {
        if (!cancelled) setCameraError('Нет доступа к камере — введите код вручную.')
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
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet sheet-tall" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
        <div className="row">
          <strong className="grow">{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="stack">
          <p className="muted">{hint}</p>
          <video ref={videoRef} className="scanner-video move-scan-video" muted playsInline />
          {cameraError ? <p className="muted">{cameraError}</p> : null}
          <label className="check-row scan-sound-toggle">
            <input
              type="checkbox"
              checked={sound}
              onChange={(event) => {
                setScanSoundEnabled(event.target.checked)
                setSound(event.target.checked)
                if (event.target.checked) playScanSound('ok')
              }}
            />
            <span>Звук при сканировании</span>
          </label>
          <label className="field">
            Или введите код вручную
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="EAN, UPC, Code 128 или текст QR"
              autoComplete="off"
            />
          </label>
          <button type="button" disabled={!manual.trim()} onClick={() => accept(manual)}>
            Присвоить этот код
          </button>
        </div>
      </div>
    </div>
  )
}
