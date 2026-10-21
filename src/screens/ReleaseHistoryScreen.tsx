import { parseAppVersion } from '../data/appVersion'

/** Что менялось в каждой версии, новые сверху. */
export function ReleaseHistoryScreen() {
  const current = parseAppVersion().number
  const history = __RELEASE_HISTORY__

  if (history.length === 0) {
    return (
      <div className="panel">
        <p className="muted">История обновлений пока пуста.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      {history.map((entry) => (
        <div key={entry.version} className={`panel stack-tight release-entry${entry.version === current ? ' release-current' : ''}`}>
          <div className="row">
            <strong className="grow">Версия {entry.version}</strong>
            <span className="muted">{entry.date}</span>
          </div>
          {entry.version === current ? <span className="release-badge">Установлена</span> : null}
          <p>{entry.notes}</p>
        </div>
      ))}
    </div>
  )
}
