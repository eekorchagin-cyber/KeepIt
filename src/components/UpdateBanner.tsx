import { versionLabel } from '../data/appVersion'
import type { AppUpdateState } from '../hooks/useAppUpdate'

export function UpdateBanner({ update }: { update: AppUpdateState }) {
  const { remote, justUpdated, stuck, standalone } = update
  if (!remote) return null
  const notes = remote.notes?.trim()

  if (justUpdated) {
    return (
      <div className="update-banner" role="status">
        <strong>Программа обновлена: версия {versionLabel(remote.version)}</strong>
        {notes ? <p>{notes}</p> : null}
        <div className="row">
          <button type="button" onClick={update.dismiss}>
            Понятно
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
