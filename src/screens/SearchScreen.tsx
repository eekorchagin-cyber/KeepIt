import { useMemo, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { isItemLent } from '../data/repository'
import { formatQty } from '../data/units'

export function SearchScreen({ state }: { state: KeepItState }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => state.searchItems(query), [state, query])

  return (
    <div className="stack">
      <div className="panel stack">
        <label className="field">
          Поиск
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="дрель, удобрения, электрика…"
            autoFocus
          />
        </label>
      </div>
      <div className="panel stack">
        <div className="list">
          {results.length === 0 ? <p className="muted">Ничего не найдено в активном объекте</p> : null}
          {results.map((item) => {
            const place = state.findPlace(item.placeId)
            const path = place ? state.pathFor(place.id).map((p) => p.name).join(' → ') : '—'
            return (
              <button
                key={item.id}
                type="button"
                className="list-item"
                onClick={() => state.navigate({ name: 'item', itemId: item.id })}
              >
                <span>
                  <strong>{item.name}</strong>
                  <span className="muted">{path}</span>
                </span>
                <span className={`badge${isItemLent(item) ? ' warn' : ''}`}>
                  {item.needsFill
                    ? 'заполнить'
                    : isItemLent(item)
                      ? `у ${item.lentTo}`
                      : formatQty(item.quantity, item.unit)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
