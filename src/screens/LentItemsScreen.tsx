import { formatLentDate } from '../data/repository'
import { objectLabelFromPlaces } from '../data/icons'
import type { KeepItState } from '../hooks/useKeepIt'
import { formatQty } from '../data/units'

export function LentItemsScreen({ state }: { state: KeepItState }) {
  const lent = state.lentItems()

  async function openItem(itemId: string, placeId: string) {
    const place = state.findPlace(placeId)
    if (place && place.objectKey !== state.settings?.activeObject) {
      await state.setActiveObject(place.objectKey)
    }
    state.navigate({ name: 'item', itemId })
  }

  return (
    <div className="stack screen-fill">
      <div className="panel stack">
        <strong>Передано на время</strong>
        <p className="muted">Вещи у других людей: кому отдали и когда. Место хранения — куда вернуть.</p>
      </div>

      <div className="panel stack">
        {lent.length === 0 ? (
          <p className="muted">Сейчас ничего не передано. Отметить можно в карточке вещи — «Передать».</p>
        ) : (
          <div className="list">
            {lent.map((item) => {
              const place = state.findPlace(item.placeId)
              const path =
                place?.code ||
                (place ? state.pathFor(place.id).map((part) => part.name).join(' / ') : '—')
              const objectLabel = place ? objectLabelFromPlaces(place.objectKey, state.places) : ''
              return (
                <button
                  key={item.id}
                  type="button"
                  className="list-item"
                  onClick={() => void openItem(item.id, item.placeId)}
                >
                  <span>
                    <strong>
                      {item.name}: {formatQty(item.quantity, item.unit)}
                    </strong>
                    <span className="muted">
                      У {item.lentTo}
                      {item.lentAt ? ` · с ${formatLentDate(item.lentAt)}` : ''}
                    </span>
                    <span className="muted">
                      Возврат: {path}
                      {objectLabel ? ` · ${objectLabel}` : ''}
                    </span>
                  </span>
                  <span className="badge warn">у {item.lentTo}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
