import { APP_VERSION, isLocalHost, type RemoteVersion } from './appVersion'

const PREF_KEY = 'keepit-update-notify'
const PERIODIC_TAG = 'keepit-update-check'

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
  standalone?: boolean
}

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> }
}

export type NotifyStatus =
  | 'on'
  | 'off'
  | 'denied'
  /** iPhone: уведомления только у программы, добавленной на экран «Домой» */
  | 'needs-home-screen'
  | 'unsupported'

export function isStandaloneApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as BadgeNavigator).standalone)
  )
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function prefEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

function setPref(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1')
    else localStorage.removeItem(PREF_KEY)
  } catch {
    // приватный режим
  }
}

export function notifyStatus(): NotifyStatus {
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') {
    return isIos() && !isStandaloneApp() ? 'needs-home-screen' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && prefEnabled() ? 'on' : 'off'
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

async function registerPeriodicCheck(): Promise<void> {
  const reg = (await registration()) as PeriodicSyncRegistration | null
  if (!reg?.periodicSync) return
  try {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
    if (status.state !== 'granted') return
    await reg.periodicSync.register(PERIODIC_TAG, { minInterval: 12 * 60 * 60 * 1000 })
  } catch {
    // фоновая проверка не поддерживается
  }
}

/** Регистрирует сервис-воркер и сообщает ему текущую версию (для фоновой проверки). */
export async function setupUpdateWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || isLocalHost()) return
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' })
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage({ type: 'current-version', version: APP_VERSION })
    if (notifyStatus() === 'on') await registerPeriodicCheck()
  } catch {
    // без сервис-воркера остаётся плашка внутри программы
  }
}

/** Вызывать из нажатия кнопки: iOS спрашивает разрешение только в ответ на действие. */
export async function enableUpdateNotifications(): Promise<NotifyStatus> {
  if (typeof Notification === 'undefined') return notifyStatus()
  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (result !== 'granted') {
    setPref(false)
    return notifyStatus()
  }
  setPref(true)
  await setupUpdateWorker()
  await registerPeriodicCheck()
  return notifyStatus()
}

export function disableUpdateNotifications(): NotifyStatus {
  setPref(false)
  return notifyStatus()
}

/** Системное уведомление и метка на значке; повторно для той же версии не показывается. */
export async function notifyAboutUpdate(remote: RemoteVersion): Promise<void> {
  if (notifyStatus() !== 'on') return
  const reg = await registration()
  reg?.active?.postMessage({ type: 'show-update', remote })
}

export async function clearUpdateBadge(): Promise<void> {
  const nav = navigator as BadgeNavigator
  try {
    if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge()
  } catch {
    // значок недоступен
  }
}
