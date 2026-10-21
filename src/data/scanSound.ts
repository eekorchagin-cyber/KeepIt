const STORAGE_KEY = 'keepit-scan-sound'
const SAMPLE_RATE = 22050

type Kind = 'ok' | 'fail'
type Tone = [frequency: number, start: number, length: number]

const TONES: Record<Kind, { tones: Tone[]; wave: 'sine' | 'triangle'; peak: number }> = {
  ok: { tones: [[1568, 0, 0.12]], wave: 'sine', peak: 0.6 },
  fail: {
    tones: [
      [262, 0, 0.14],
      [196, 0.18, 0.2],
    ],
    wave: 'triangle',
    peak: 0.8,
  },
}

/** Короткий сигнал как WAV-файл в памяти: его играет обычный <audio>. */
function toneUrl(kind: Kind): string {
  const { tones, wave, peak } = TONES[kind]
  const total = Math.ceil((Math.max(...tones.map(([, start, length]) => start + length)) + 0.03) * SAMPLE_RATE)
  const samples = new Float32Array(total)
  const attack = 0.01 * SAMPLE_RATE
  for (const [frequency, start, length] of tones) {
    const from = Math.floor(start * SAMPLE_RATE)
    const count = Math.floor(length * SAMPLE_RATE)
    for (let i = 0; i < count && from + i < total; i++) {
      const phase = ((frequency * i) / SAMPLE_RATE) % 1
      const value = wave === 'sine' ? Math.sin(2 * Math.PI * phase) : 4 * Math.abs(phase - 0.5) - 1
      const envelope = Math.min(1, i / attack) * (1 - i / count) ** 2
      samples[from + i] += value * envelope * peak
    }
  }

  const view = new DataView(new ArrayBuffer(44 + total * 2))
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + total * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, total * 2, true)
  for (let i = 0; i < total; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  }
  return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }))
}

let players: Record<Kind, HTMLAudioElement> | null = null
let unlocked = false

function getPlayers(): Record<Kind, HTMLAudioElement> | null {
  if (players) return players
  if (typeof Audio === 'undefined') return null
  const make = (kind: Kind) => {
    const audio = new Audio(toneUrl(kind))
    audio.preload = 'auto'
    return audio
  }
  players = { ok: make('ok'), fail: make('fail') }
  return players
}

/**
 * iOS разрешает странице звук только после касания: на первом касании беззвучно «проигрываем» оба сигнала,
 * после этого сканер может подавать их сам. Обычный <audio>, в отличие от Web Audio,
 * на iPhone не глушится переключателем «Бесшумно».
 */
export function installScanSoundUnlock() {
  const types = ['touchend', 'click', 'pointerdown'] as const
  const unlock = () => {
    if (unlocked) return
    const all = getPlayers()
    if (!all) return
    const attempts = Object.values(all).map((audio) => {
      audio.muted = true
      return audio.play().then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
      })
    })
    void Promise.all(attempts)
      .then(() => {
        unlocked = true
        for (const type of types) window.removeEventListener(type, unlock, true)
      })
      .catch(() => {
        for (const audio of Object.values(all)) audio.muted = false
      })
  }
  for (const type of types) window.addEventListener(type, unlock, { passive: true, capture: true })
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
export function playScanSound(kind: Kind) {
  navigator.vibrate?.(kind === 'ok' ? 60 : [80, 60, 80])
  if (!scanSoundEnabled()) return
  const audio = getPlayers()?.[kind]
  if (!audio) return
  audio.muted = false
  audio.currentTime = 0
  void audio.play().catch(() => undefined)
}
