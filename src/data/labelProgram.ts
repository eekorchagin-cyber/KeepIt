/**
 * Программа печати меток на этом устройстве.
 * Браузер не умеет выбрать установленную программу по имени, поэтому KeepIt открывает её по адресу:
 * известное имя (NIIMBOT, AiYin), команда «Команды» или свой адрес.
 */

const KIND_KEY = 'keepit-label-program'
const SHORTCUT_KEY = 'keepit-label-program-shortcut'
const CUSTOM_KEY = 'keepit-label-program-url'
const NOTE_EVENT = 'keepit:label-link-note'

export type LabelProgramKind = 'off' | 'niimbot' | 'aiyin' | 'shortcut' | 'custom'

export type LabelProgram = {
  kind: LabelProgramKind
  /** Как назвать программу в сообщении */
  name: string
  /** Адрес открытия; пусто — только копировать ссылку */
  url: string
}

const KINDS: LabelProgramKind[] = ['off', 'niimbot', 'aiyin', 'shortcut', 'custom']

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

export function readLabelProgramKind(): LabelProgramKind {
  const stored = readStored(KIND_KEY)
  return KINDS.find((kind) => kind === stored) ?? 'off'
}

export function readLabelShortcutName(): string {
  return readStored(SHORTCUT_KEY) ?? ''
}

export function readLabelCustomUrl(): string {
  return readStored(CUSTOM_KEY) ?? ''
}

export function setLabelProgramKind(kind: LabelProgramKind) {
  writeStored(KIND_KEY, kind)
}

export function setLabelShortcutName(name: string) {
  writeStored(SHORTCUT_KEY, name)
}

export function setLabelCustomUrl(url: string) {
  writeStored(CUSTOM_KEY, url)
}

/** Пустая строка — адрес годится. Иначе текст, почему его нельзя открыть. */
export function customUrlError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Напишите адрес программы.'
  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) return 'Такой адрес открыть нельзя.'
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return 'Адрес должен начинаться с имени программы и «://», например niimbot://'
  }
  return null
}

export function readLabelProgram(): LabelProgram {
  const kind = readLabelProgramKind()
  if (kind === 'niimbot') return { kind, name: 'NIIMBOT', url: 'niimbot://' }
  if (kind === 'aiyin') return { kind, name: 'AiYin', url: 'aiyin://' }
  if (kind === 'shortcut') {
    const name = readLabelShortcutName().trim()
    return {
      kind,
      name: name || 'Команды',
      url: name ? `shortcuts://run-shortcut?name=${encodeURIComponent(name)}` : '',
    }
  }
  if (kind === 'custom') {
    const raw = readLabelCustomUrl().trim()
    return { kind, name: 'программа печати', url: customUrlError(raw) ? '' : raw }
  }
  return { kind: 'off', name: '', url: '' }
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.left = '0'
    area.style.opacity = '0'
    document.body.append(area)
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Копирование в том же нажатии, до перехода в другую программу. */
function writeClipboard(text: string) {
  legacyCopy(text)
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
}

/**
 * Открыть назначенную программу. Вызывать прямо из нажатия кнопки.
 * Переход по адресу программы надёжнее, чем новое окно: iPhone так и открывает чужие программы.
 */
export function openLabelProgram(): boolean {
  const { url } = readLabelProgram()
  if (!url) return false
  window.location.assign(url)
  return true
}

/**
 * Копирует ссылку метки и, если программа назначена, открывает её,
 * чтобы ссылку можно было сразу вставить в метку.
 */
export function copyLabelLink(url: string): string {
  writeClipboard(url)
  const program = readLabelProgram()
  if (program.kind === 'off') {
    return 'Ссылка скопирована. Вставьте её в метку в программе печати.'
  }
  if (!program.url) {
    return program.kind === 'shortcut'
      ? 'Ссылка скопирована. Укажите имя команды в «Настройках» — тогда программа откроется сама.'
      : 'Ссылка скопирована. Укажите адрес программы в «Настройках» — тогда она откроется сама.'
  }
  openLabelProgram()
  return `Ссылка скопирована. Открываю «${program.name}» — вставьте ссылку в метку.`
}

/** Сообщение экрану места или вещи после копирования из меню «···». */
export function publishLabelLinkNote(message: string) {
  window.dispatchEvent(new CustomEvent(NOTE_EVENT, { detail: message }))
}

export function onLabelLinkNote(handler: (message: string) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<string>).detail
    if (typeof detail === 'string') handler(detail)
  }
  window.addEventListener(NOTE_EVENT, listener)
  return () => window.removeEventListener(NOTE_EVENT, listener)
}
