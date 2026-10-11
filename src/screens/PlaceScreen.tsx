import type { KeepItState } from '../hooks/useKeepIt'
import { objectLabelFromPlaces } from '../data/icons'
import { ModeCategory } from '../components/ModeCategory'
import { isItemLent } from '../data/repository'
import { formatQty } from '../data/units'
import type { UnitCode } from '../types'

function formatStock(stock: { total: number; unit: UnitCode | null; itemCount: number }): string {
  if (stock.itemCount === 0) return '0'
  if (stock.unit) return formatQty(stock.total, stock.unit)
  return String(stock.total)
}

export function PlaceScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const path = state.pathFor(placeId)
  const children = state.childPlaces(placeId)
  const items = state.itemsInPlace(placeId)

  if (!place) {
    return (
      <div className="panel stack">
        <p>Место не найдено.</p>
        <button type="button" onClick={() => state.jump({ name: 'home' })}>
          На главную
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="breadcrumbs">
          <button
            type="button"
            onClick={() => state.navigate({ name: 'object', objectKey: place.objectKey })}
          >
            {objectLabelFromPlaces(place.objectKey, state.places)}
          </button>
          {path.slice(1).map((part) => (
            <span key={part.id}>
              /
              <button type="button" onClick={() => state.navigate({ name: 'place', placeId: part.id })}>
                {part.name}
              </button>
            </span>
          ))}
        </div>
        <div>
          <strong style={{ fontSize: '1.15em' }}>{place.name}</strong>
          <div className="place-code">{place.code}</div>
        </div>
        <p className="muted">«+» — добавить место или вещь · «…» — действия с этим местом</p>
      </div>

      <div className="panel stack">
        <strong>Вложенные места</strong>
        <div className="list">
          {children.length === 0 ? <p className="muted">Пока пусто — нажмите «+»</p> : null}
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="list-item"
              onClick={() => state.navigate({ name: 'place', placeId: child.id })}
            >
              <span>
                <strong>{child.name}</strong>
                <span className="place-code muted">{child.code}</span>
              </span>
              <span className="badge">{formatStock(state.stockInSubtree(child.id))}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <strong>Содержимое здесь</strong>
        <div className="list">
          {items.length === 0 ? <p className="muted">Вещей непосредственно здесь нет</p> : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="list-item"
              onClick={() => state.navigate({ name: 'item', itemId: item.id })}
            >
              <span>
                <strong>{item.name}</strong>
                <span className="muted">
                  <ModeCategory
                    mode={item.mode}
                    category={item.category}
                    subcategory={item.subcategory}
                    suffix={
                      item.needsFill
                        ? ' · заполнить'
                        : isItemLent(item)
                          ? ` · у ${item.lentTo}`
                          : ''
                    }
                  />
                </span>
              </span>
              <span className={`badge${isItemLent(item) ? ' warn' : ''}`}>
                {item.needsFill
                  ? 'заполнить'
                  : isItemLent(item)
                    ? `у ${item.lentTo}`
                    : formatQty(item.quantity, item.unit)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
