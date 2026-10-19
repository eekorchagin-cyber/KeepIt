import { ObjectBadge } from '../components/ObjectBadge'
import { objectLabelFromPlaces } from '../data/icons'
import type { KeepItState } from '../hooks/useKeepIt'
import { PlaceTools } from '../components/PlaceTools'
import { BadgeCountToggle } from '../components/BadgeCountToggle'
import type { ObjectKey } from '../types'

export function ObjectScreen({ state, objectKey }: { state: KeepItState; objectKey: ObjectKey }) {
  const root = state.places.find((place) => place.type === 'object' && place.objectKey === objectKey)
  const label = objectLabelFromPlaces(objectKey, state.places)
  const rooms = root ? state.childPlaces(root.id) : []

  return (
    <div className="stack screen-fill">
      <div className="panel object-hero">
        {root ? <ObjectBadge place={root} size="lg" /> : null}
        <div className="grow">
          <strong className="object-hero-title">{label}</strong>
        </div>
        {root ? <PlaceTools state={state} place={root} /> : null}
      </div>

      <div className="panel stack">
        <BadgeCountToggle state={state} />
        {root ? (
          <button
            type="button"
            className="list-item"
            onClick={() => state.navigate({ name: 'place', placeId: root.id })}
          >
            <span>
              <strong>Весь объект</strong>
              <span className="place-code muted">{root.code}</span>
            </span>
            <span className="badge">{state.placeBadge(root.id)}</span>
          </button>
        ) : null}

        <div className="list">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className="list-item"
              onClick={() => state.navigate({ name: 'place', placeId: room.id })}
            >
              <span>
                <strong>{room.name}</strong>
                <span className="place-code muted">{room.code}</span>
              </span>
              <span className="badge">{state.placeBadge(room.id)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
