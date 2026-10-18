import { useCallback, useEffect, useState } from 'react'
import { APP_VERSION, fetchRemoteVersion, isLocalHost, type RemoteVersion } from '../data/appVersion'
import {
  clearUpdateBadge,
  isStandaloneApp,
  notifyAboutUpdate,
  setupUpdateWorker,
} from '../data/updateNotifications'

const RELOAD_KEY = 'keepit-update-reload'
const DISMISS_KEY = 'keepit-update-dismiss'
const SEEN_KEY = 'keepit-seen-version'
const CHECK_EVERY_MS = 5 * 60_000

function readStorage(storage: Storage, key: string): string {
  try {
    return storage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStorage(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // приватный режим
  }
}

export type AppUpdateState = {
  remote: RemoteVersion | null
  /** Обновились: показать «что нового» один раз */
  justUpdated: boolean
  /** Перезагрузка была, а версия не сменилась */
  stuck: boolean
  standalone: boolean
  checking: boolean
  check: () => Promise<RemoteVersion | null>
  reload: () => void
  dismiss: () => void
}

export function useAppUpdate(): AppUpdateState {
  const [remote, setRemote] = useState<RemoteVersion | null>(null)
  const [justUpdated, setJustUpdated] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [checking, setChecking] = useState(false)

  const runCheck = useCallback(async () => {
    if (isLocalHost()) return null
    const data = await fetchRemoteVersion()
    if (!data) return null
    const reloadFor = readStorage(sessionStorage, RELOAD_KEY)

    if (data.version === APP_VERSION) {
      void clearUpdateBadge()
      writeStorage(sessionStorage, RELOAD_KEY, null)
      setStuck(false)
      if (readStorage(localStorage, SEEN_KEY) === APP_VERSION) {
        setRemote(null)
        setJustUpdated(false)
        return data
      }
      // Первый запуск новой версии: показать «что нового», если это обновление, а не первая установка
      const hadOlder = readStorage(localStorage, SEEN_KEY) !== '' || reloadFor !== ''
      if (!hadOlder) {
        writeStorage(localStorage, SEEN_KEY, APP_VERSION)
        return data
      }
      setJustUpdated(true)
      setRemote(data)
      return data
    }

    setJustUpdated(false)
    setStuck(reloadFor === data.version)
    void notifyAboutUpdate(data)
    if (readStorage(sessionStorage, DISMISS_KEY) !== data.version) setRemote(data)
    return data
  }, [])

  /** Ручная проверка из настроек — с индикатором «Проверяю…». */
  const check = useCallback(async () => {
    setChecking(true)
    try {
      return await runCheck()
    } finally {
      setChecking(false)
    }
  }, [runCheck])

  useEffect(() => {
    void setupUpdateWorker()
    void runCheck()
    const timer = window.setInterval(() => void runCheck(), CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runCheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [runCheck])

  const reload = useCallback(() => {
    if (!remote) return
    writeStorage(sessionStorage, RELOAD_KEY, remote.version)
    location.reload()
  }, [remote])

  const dismiss = useCallback(() => {
    if (justUpdated) writeStorage(localStorage, SEEN_KEY, APP_VERSION)
    else if (remote) writeStorage(sessionStorage, DISMISS_KEY, remote.version)
    setRemote(null)
    setStuck(false)
    setJustUpdated(false)
  }, [justUpdated, remote])

  return { remote, justUpdated, stuck, standalone: isStandaloneApp(), checking, check, reload, dismiss }
}
