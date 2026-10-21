const STORAGE_KEY = 'keepit-scan-sound'

let audio: AudioContext | null = null

function context(): AudioContext | null {
  if (audio) return audio
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  audio = new Ctor()
  return audio
}

/**
 * iOS включает звук страницы только внутри касания: на каждом касании «будим» аудио,
 * иначе сигнал сканера (он звучит без касания) будет немым.
 */
export function installScanSoundUnlock() {
  const unlock = () => {
    if (!scanSoundEnabled()) return
    const ctx = context()
    if (!ctx || ctx.state === 'running') return
    void ctx.resume()
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, 22050)
    source.connect(ctx.destination)
    source.start(0)
  }
  for (const type of ['pointerdown', 'touchend', 'click']) {
    window.addEventListener(type, unlock, { passive: true, capture: true })
  }
}

export function scanSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setScanSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    /* без сохранения настройки */
  }
}

/** Удачный скан — короткий высокий сигнал, неудачный — два низких. */
export function playScanSound(kind: 'ok' | 'fail') {
  navigator.vibrate?.(kind === 'ok' ? 60 : [80, 60, 80])
  if (!scanSoundEnabled()) return
  const ctx = context()
  if (!ctx) return
  if (ctx.state !== 'running') void ctx.resume()
  const tones: Array<[frequency: number, start: number, length: number]> =
    kind === 'ok'
      ? [[1568, 0, 0.12]]
      : [
          [262, 0, 0.14],
          [196, 0.18, 0.2],
        ]
  for (const [frequency, start, length] of tones) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = kind === 'ok' ? 'sine' : 'triangle'
    oscillator.frequency.value = frequency
    const at = ctx.currentTime + start
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(kind === 'ok' ? 0.3 : 0.45, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(at)
    oscillator.stop(at + length + 0.02)
  }
}
