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
import {
  customUrlError,
  openLabelProgram,
  readLabelCustomUrl,
  readLabelProgram,
  readLabelProgramKind,
  readLabelShortcutName,
  setLabelCustomUrl,
  setLabelProgramKind,
  setLabelShortcutName,
  type LabelProgramKind,
} from '../data/labelProgram'
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

const PROGRAM_HINT: Record<LabelProgramKind, string> = {
  off: '«Скопировать ссылку» копирует ссылку метки. Вставьте её в программу печати сами.',
  niimbot:
    'После «Скопировать ссылку» откроется NIIMBOT — вставьте ссылку в QR-код метки. Если программа не открылась, выберите «Команда на iPhone» или «Свой адрес».',
  aiyin:
    'После «Скопировать ссылку» откроется AiYin — вставьте ссылку в QR-код метки. Если программа не открылась, выберите «Команда на iPhone» или «Свой адрес».',
  shortcut:
    'В приложении «Команды» создайте команду с действием «Открыть программу» и напишите здесь её имя. После «Скопировать ссылку» KeepIt откроет эту команду.',
  custom:
    'Адрес, по которому телефон открывает программу, например niimbot://. После «Скопировать ссылку» KeepIt перейдёт по этому адресу.',
}

export function SettingsScreen({ state }: { state: KeepItState }) {
  const [status, setStatus] = useState<NotifyStatus>(() => notifyStatus())
  const [busy, setBusy] = useState(false)
  const [soundLevel, setSoundLevel] = useState<ScanSoundLevel>(scanSoundLevel)
  const [programKind, setProgramKind] = useState<LabelProgramKind>(readLabelProgramKind)
  const [shortcutName, setShortcutName] = useState(readLabelShortcutName)
  const [customUrl, setCustomUrl] = useState(readLabelCustomUrl)
  const [programNote, setProgramNote] = useState<string | null>(null)

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

        <label className="field">
          Программа для печати меток
          <ChoiceSelect<LabelProgramKind>
            title="Программа для печати меток"
            value={programKind}
            options={[
              { value: 'off', label: 'Не открывать', hint: 'Только копировать ссылку' },
              { value: 'niimbot', label: 'NIIMBOT', hint: 'Приложение принтера NIIMBOT' },
              { value: 'aiyin', label: 'AiYin', hint: 'Приложение принтера AiYin' },
              {
                value: 'shortcut',
                label: 'Команда на iPhone',
                hint: 'Команда «Команды», которая открывает нужную программу',
              },
              { value: 'custom', label: 'Свой адрес', hint: 'Адрес, по которому открывается программа' },
            ]}
            onChange={(kind) => {
              setLabelProgramKind(kind)
              setProgramKind(kind)
              setProgramNote(null)
            }}
          />
        </label>
        <p className="muted">{PROGRAM_HINT[programKind]}</p>
        {programKind === 'shortcut' ? (
          <label className="field">
            Имя команды
            <input
              value={shortcutName}
              placeholder="Например, Печать метки"
              onChange={(event) => {
                setLabelShortcutName(event.target.value)
                setShortcutName(event.target.value)
                setProgramNote(null)
              }}
            />
          </label>
        ) : null}
        {programKind === 'custom' ? (
          <label className="field">
            Адрес программы
            <input
              value={customUrl}
              placeholder="niimbot://"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setLabelCustomUrl(event.target.value)
                setCustomUrl(event.target.value)
                setProgramNote(null)
              }}
            />
          </label>
        ) : null}
        {programKind !== 'off' ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const program = readLabelProgram()
              if (!program.url) {
                setProgramNote(
                  program.kind === 'custom'
                    ? (customUrlError(customUrl) ?? 'Напишите адрес программы.')
                    : 'Напишите имя команды — без него программу не открыть.',
                )
                return
              }
              openLabelProgram()
              setProgramNote(`Пробую открыть «${program.name}». Если ничего не произошло, укажите другой адрес или команду.`)
            }}
          >
            Проверить открытие
          </button>
        ) : null}
        {programNote ? <p className="muted">{programNote}</p> : null}

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
