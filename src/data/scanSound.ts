const STORAGE_KEY = 'keepit-scan-sound'
const LAST_LEVEL_KEY = 'keepit-scan-sound-last'
const SAMPLE_RATE = 22050

export type ScanSoundLevel = 'off' | 'quiet' | 'loud'
type AudibleLevel = Exclude<ScanSoundLevel, 'off'>

/** «Тихо» — примерно на 12 дБ тише */
const LEVEL_GAIN: Record<AudibleLevel, number> = { quiet: 0.25, loud: 1 }

type Kind = 'ok' | 'fail'
type Tone = [frequency: number, start: number, length: number]

/**
 * Частоты — там, где динамик телефона громкий (низкие 200 Гц он почти не воспроизводит).
 * «buzz» — сглаженный прямоугольный сигнал: богат обертонами, звучит громче чистого тона.
 */
const TONES: Record<Kind, { tones: Tone[]; wave: 'sine' | 'buzz'; peak: number }> = {
  ok: { tones: [[2093, 0, 0.15]], wave: 'sine', peak: 1 },
  fail: {
    tones: [
      [523, 0, 0.16],
      [392, 0.2, 0.24],
    ],
    wave: 'buzz',
    peak: 0.9,
  },
}

function synth(kind: Kind): Float32Array {
  const { tones, wave, peak } = TONES[kind]
  const total = Math.ceil((Math.max(...tones.map(([, start, length]) => start + length)) + 0.03) * SAMPLE_RATE)
  const samples = new Float32Array(total)
  const attack = 0.005 * SAMPLE_RATE
  for (const [frequency, start, length] of tones) {
    const from = Math.floor(start * SAMPLE_RATE)
    const count = Math.floor(length * SAMPLE_RATE)
    // Полная громкость почти до конца, затем быстрое затухание — без щелчка
    const release = Math.floor(count * 0.3)
    for (let i = 0; i < count && from + i < total; i++) {
      const sine = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE)
      const value = wave === 'sine' ? sine : Math.tanh(3 * sine) / Math.tanh(3)
      const tail = count - i
      const envelope = Math.min(1, i / attack) * (tail < release ? (tail / release) ** 1.5 : 1)
      samples[from + i] += value * envelope * peak
    }
  }
  return samples
}

/** Короткий сигнал как WAV-файл в памяти: его играет обычный <audio> (запасной путь). */
function toneUrl(kind: Kind, gain: number): string {
  const samples = synth(kind).map((value) => value * gain)
  const total = samples.length
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

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

const isAppleTouch =
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))

/**
 * Web Audio звучит почти без задержки, но на iPhone без audioSession (iOS до 17) его глушит
 * переключатель «Бесшумно» — там остаётся <audio>.
 */
const webAudioUsable = 'audioSession' in navigator || !isAppleTouch

let context: AudioContext | null = null
let buffers: Record<Kind, AudioBuffer> | null = null

function getContext(): AudioContext | null {
  if (context) return context
  if (!webAudioUsable) return null
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  const session = (navigator as AudioSessionNavigator).audioSession
  if (session) session.type = 'playback'
  context = new Ctor()
  const toBuffer = (kind: Kind) => {
    const samples = synth(kind)
    const buffer = context!.createBuffer(1, samples.length, SAMPLE_RATE)
    buffer.getChannelData(0).set(samples)
    return buffer
  }
  buffers = { ok: toBuffer('ok'), fail: toBuffer('fail') }
  return context
}

function playWebAudio(kind: Kind, level: AudibleLevel): boolean {
  const ctx = getContext()
  if (!ctx || !buffers) return false
  if (ctx.state !== 'running') {
    void ctx.resume()
    return false
  }
  const source = ctx.createBufferSource()
  source.buffer = buffers[kind]
  const gain = ctx.createGain()
  gain.gain.value = LEVEL_GAIN[level]
  source.connect(gain).connect(ctx.destination)
  source.start()
  return true
}

type PlayerKey = `${Kind}-${AudibleLevel}`

let players: Record<PlayerKey, HTMLAudioElement> | null = null
let unlocked = false

/** У <audio> на iPhone громкость программно не меняется — для «Тихо» отдельные, более тихие файлы. */
function getPlayers(): Record<PlayerKey, HTMLAudioElement> | null {
  if (players) return players
  if (typeof Audio === 'undefined') return null
  const make = (kind: Kind, level: AudibleLevel) => {
    const audio = new Audio(toneUrl(kind, LEVEL_GAIN[level]))
    audio.preload = 'auto'
    return audio
  }
  players = {
    'ok-loud': make('ok', 'loud'),
    'fail-loud': make('fail', 'loud'),
    'ok-quiet': make('ok', 'quiet'),
    'fail-quiet': make('fail', 'quiet'),
  }
  return players
}

/**
 * iOS разрешает странице звук только после касания: на первом касании беззвучно «проигрываем» оба сигнала,
 * после этого сканер может подавать их сам. Обычный <audio>, в отличие от Web Audio,
 * на iPhone не глушится переключателем «Бесшумно».
 */
export function installScanSoundUnlock() {
  const types = ['touchend', 'click', 'pointerdown'] as const
  // Web Audio iOS может «усыпить» (камера, сворачивание) — будим на каждом касании
  const wake = () => {
    const ctx = getContext()
    if (ctx && ctx.state !== 'running') void ctx.resume()
  }
  for (const type of types) window.addEventListener(type, wake, { passive: true, capture: true })

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
    /* без сохранения настройки */
  }
}

export function scanSoundLevel(): ScanSoundLevel {
  const stored = readStored(STORAGE_KEY)
  if (stored === 'off' || stored === 'quiet') return stored
  return 'loud'
}

export function setScanSoundLevel(level: ScanSoundLevel) {
  writeStored(STORAGE_KEY, level)
  if (level !== 'off') writeStored(LAST_LEVEL_KEY, level)
}

export function scanSoundEnabled(): boolean {
  return scanSoundLevel() !== 'off'
}

/** Галочка в сканере: выключить или вернуть уровень, выбранный в настройках. */
export function setScanSoundEnabled(enabled: boolean) {
  setScanSoundLevel(enabled ? (readStored(LAST_LEVEL_KEY) === 'quiet' ? 'quiet' : 'loud') : 'off')
}

/** Удачный скан — короткий высокий сигнал, неудачный — два пониже. */
export function playScanSound(kind: Kind) {
  navigator.vibrate?.(kind === 'ok' ? 60 : [80, 60, 80])
  const level = scanSoundLevel()
  if (level === 'off') return
  if (playWebAudio(kind, level)) return
  const audio = getPlayers()?.[`${kind}-${level}`]
  if (!audio) return
  audio.muted = false
  if (audio.currentTime > 0) audio.currentTime = 0
  void audio.play().catch(() => undefined)
}
