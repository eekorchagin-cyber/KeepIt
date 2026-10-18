import { ObjectBadge } from '../components/ObjectBadge'
import { objectLabelFromPlaces } from '../data/icons'
import type { KeepItState } from '../hooks/useKeepIt'
import { formatQty } from '../data/units'
import { InventoryEntry } from './InventoryScreen'
import type { ObjectKey, UnitCode } from '../types'

function formatStock(stock: { total: number; unit: UnitCode | null; itemCount: number }): string {
  if (stock.itemCount === 0) return '0'
  if (stock.unit) return formatQty(stock.total, stock.unit)
  return String(stock.total)
}

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
      </div>

      {root ? (
        <button
          type="button"
          className="secondary"
          onClick={() => state.navigate({ name: 'import-list', placeId: root.id })}
        >
          Импорт списка вещей в «{label}»
        </button>
      ) : null}
      {root ? <InventoryEntry state={state} place={root} /> : null}

      <div className="panel stack">
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
            <span className="badge">{formatStock(state.stockInSubtree(root.id))}</span>
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
              <span className="badge">{formatStock(state.stockInSubtree(room.id))}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
