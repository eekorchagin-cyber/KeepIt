import { ObjectBadge } from '../components/ObjectBadge'
import { versionLabel } from '../data/appVersion'
import { dueServiceItems } from '../data/service'
import { rootObjects } from '../data/icons'
import type { KeepItState } from '../hooks/useKeepIt'
import type { ObjectKey } from '../types'

export function HomeScreen({ state }: { state: KeepItState }) {
  const roots = rootObjects(state.places)
  const due = dueServiceItems(state.serviceItems())

  async function openObject(objectKey: ObjectKey) {
    await state.setActiveObject(objectKey)
    state.navigate({ name: 'object', objectKey })
  }

  return (
    <div className="stack screen-fill home-screen">
      {due.length > 0 ? (
        <button type="button" className="place-banner" onClick={() => state.navigate({ name: 'reminders' })}>
          <strong>Пора провести ТО: {due.length}</strong>
          <span className="muted">
            {' '}
            — {due
              .slice(0, 3)
              .map((item) => item.name)
              .join(', ')}
            {due.length > 3 ? '…' : ''}
          </span>
        </button>
      ) : null}
      <div className="section-grid">
        {roots.map((root) => {
          const active = state.settings?.activeObject === root.objectKey
          return (
            <button
              key={root.id}
              type="button"
              className={`section-card${active ? ' active' : ''}`}
              onClick={() => void openObject(root.objectKey)}
            >
              <ObjectBadge place={root} size="lg" />
              <span>{root.name}</span>
            </button>
          )
        })}
      </div>
      <p className="muted app-version">KeepIt, версия {versionLabel()}</p>
    </div>
  )
}
