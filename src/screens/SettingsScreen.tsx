import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { ChoiceSelect } from '../components/ChoiceSelect'
import {
  disableUpdateNotifications,
  enableUpdateNotifications,
  notifyStatus,
  type NotifyStatus,
} from '../data/updateNotifications'
import { playScanSound, scanSoundLevel, setScanSoundLevel, type ScanSoundLevel } from '../data/scanSound'
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

export function SettingsScreen({ state }: { state: KeepItState }) {
  const [status, setStatus] = useState<NotifyStatus>(() => notifyStatus())
  const [busy, setBusy] = useState(false)
  const [soundLevel, setSoundLevel] = useState<ScanSoundLevel>(scanSoundLevel)

  async function toggleNotifications() {
    setBusy(true)
    try {
      setStatus(status === 'on' ? disableUpdateNotifications() : await enableUpdateNotifications())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Настройки</strong>

        <label className="field">
          Тема
          <ChoiceSelect<ThemeMode>
            title="Тема"
            value={state.settings?.theme ?? 'system'}
            options={[
              { value: 'system', label: 'Как в системе', hint: 'Светлая днём, тёмная ночью — как на телефоне' },
              { value: 'light', label: 'Светлая' },
              { value: 'dark', label: 'Тёмная' },
            ]}
            onChange={(theme) => void state.setTheme(theme)}
          />
        </label>

        <label className="field">
          Звук при сканировании
          <ChoiceSelect<ScanSoundLevel>
            title="Звук при сканировании"
            value={soundLevel}
            options={[
              { value: 'loud', label: 'Громко', hint: 'Хорошо слышно в гараже, на улице, при шуме' },
              { value: 'quiet', label: 'Тихо', hint: 'Дома, когда рядом спят или работают' },
              { value: 'off', label: 'Выключен', hint: 'Только зелёная или красная рамка вокруг видео' },
            ]}
            onChange={(level) => {
              setScanSoundLevel(level)
              setSoundLevel(level)
              playScanSound('ok')
            }}
          />
        </label>

        <p className="muted">
          Сейчас всё хранится локально в браузере этого устройства. Семья и Supabase подключим после отработки
          основных сценариев.
        </p>
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
