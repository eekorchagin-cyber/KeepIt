import type { KeepItState } from '../hooks/useKeepIt'
import type { ThemeMode } from '../types'

export function SettingsScreen({ state }: { state: KeepItState }) {
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

        <p className="muted">Версия: {__APP_VERSION__}</p>
        <p className="muted">
          Сейчас всё хранится локально в браузере этого устройства. Семья и Supabase подключим после отработки
          основных сценариев.
        </p>
      </div>
    </div>
  )
}
