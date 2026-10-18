import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import type { AppUpdateState } from '../hooks/useAppUpdate'
import { APP_VERSION, parseAppVersion, versionLabel } from '../data/appVersion'
import {
  disableUpdateNotifications,
  enableUpdateNotifications,
  notifyStatus,
  type NotifyStatus,
} from '../data/updateNotifications'
import type { ThemeMode } from '../types'

const NOTIFY_TEXT: Record<NotifyStatus, string> = {
  on: 'Включены: телефон сообщит о новой версии программы и раз в день — о предстоящем или просроченном ТО оборудования.',
  off: 'Выключены. Новая версия всё равно появится плашкой внутри программы.',
  denied:
    'Запрещены в настройках телефона. Разрешите уведомления для KeepIt (или для браузера) в системных настройках.',
  'needs-home-screen':
    'На iPhone уведомления доступны только программе на экране «Домой»: в Safari нажмите «Поделиться» → «На экран „Домой“» и откройте KeepIt оттуда.',
  unsupported: 'Этот браузер не поддерживает уведомления. Новая версия появится плашкой внутри программы.',
}

export function SettingsScreen({ state, update }: { state: KeepItState; update: AppUpdateState }) {
  const version = parseAppVersion()
  const [status, setStatus] = useState<NotifyStatus>(() => notifyStatus())
  const [busy, setBusy] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)

  async function toggleNotifications() {
    setBusy(true)
    try {
      setStatus(status === 'on' ? disableUpdateNotifications() : await enableUpdateNotifications())
    } finally {
      setBusy(false)
    }
  }

  async function checkNow() {
    setCheckResult(null)
    const remote = await update.check()
    if (!remote) setCheckResult('Не удалось проверить: нет связи с сервером.')
    else if (remote.version === APP_VERSION) setCheckResult('У вас последняя версия.')
    else setCheckResult(`Доступна версия ${versionLabel(remote.version)} — нажмите «Обновить» вверху экрана.`)
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Настройки</strong>

        <label className="field">
          Тема
          <select
            value={state.settings?.theme ?? 'system'}
            onChange={(e) => void state.setTheme(e.target.value as ThemeMode)}
          >
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>

        <p className="muted">
          Сейчас всё хранится локально в браузере этого устройства. Семья и Supabase подключим после отработки
          основных сценариев.
        </p>
      </div>

      <div className="panel stack">
        <strong>Версия программы</strong>
        <p>
          Версия {version.number}
          {version.date ? ` от ${version.date}${version.time ? `, ${version.time}` : ''}` : ''}
        </p>
        <button type="button" className="secondary" disabled={update.checking} onClick={() => void checkNow()}>
          {update.checking ? 'Проверяю…' : 'Проверить обновления'}
        </button>
        {checkResult ? <p className="muted">{checkResult}</p> : null}
      </div>

      <div className="panel stack">
        <strong>Уведомления: обновления и ТО</strong>
        <p className="muted">{NOTIFY_TEXT[status]}</p>
        {status === 'on' || status === 'off' ? (
          <button
            type="button"
            className={status === 'on' ? 'secondary' : undefined}
            disabled={busy}
            onClick={() => void toggleNotifications()}
          >
            {status === 'on' ? 'Выключить уведомления' : 'Включить уведомления'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
