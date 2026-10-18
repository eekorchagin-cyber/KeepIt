import { ObjectBadge } from '../components/ObjectBadge'
import { rootObjects } from '../data/icons'
import type { KeepItState } from '../hooks/useKeepIt'
import type { ObjectKey } from '../types'

export function HomeScreen({ state }: { state: KeepItState }) {
  const roots = rootObjects(state.places)

  async function openObject(objectKey: ObjectKey) {
    await state.setActiveObject(objectKey)
    state.navigate({ name: 'object', objectKey })
  }

  return (
    <div className="stack screen-fill home-screen">
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
    </div>
  )
}
