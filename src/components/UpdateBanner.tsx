import { versionLabel } from '../data/appVersion'
import type { AppUpdateState } from '../hooks/useAppUpdate'

export function UpdateBanner({ update, onShowHistory }: { update: AppUpdateState; onShowHistory: () => void }) {
  const { remote, justUpdated, stuck, standalone } = update
  if (!remote) return null
  const notes = remote.notes?.trim()

  // Подробности уже были показаны до обновления — здесь только подтверждение
  if (justUpdated) {
    return (
      <div className="update-banner" role="status">
        <strong>Обновление прошло успешно</strong>
        <p>Установлена версия {versionLabel(remote.version)}.</p>
        <div className="row wrap">
          <button type="button" onClick={update.dismiss}>
            Понятно
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              update.dismiss()
              onShowHistory()
            }}
          >
            История обновлений
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="update-banner" role="status">
      <strong>Доступна новая версия {versionLabel(remote.version)}</strong>
      {notes ? <p>{notes}</p> : null}
      {stuck ? (
        <p>
          Версия не сменилась. Полностью закройте KeepIt (смахните из списка открытых программ) и
          откройте снова{standalone ? ' с экрана «Домой»' : ''}. Ярлык не удаляйте.
        </p>
      ) : null}
      <div className="row wrap">
        {stuck ? null : (
          <button type="button" onClick={update.reload}>
            Обновить
          </button>
        )}
        <button type="button" className="secondary" onClick={update.dismiss}>
          {stuck ? 'Понятно' : 'Позже'}
        </button>
      </div>
    </div>
  )
}
