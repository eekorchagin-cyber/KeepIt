import { useMemo, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { normalizeSearch } from '../data/repository'
import { PlaceTypeIcon } from './PlaceTypeIcon'
import { ObjectBadge } from './ObjectBadge'

const SEARCH_LIMIT = 40

/**
 * Пошаговый выбор места по мере вложенности: путь вверху (можно вернуться на любой уровень),
 * ниже — вложенные места текущего уровня. Выбранным считается место, где остановились.
 * Поиск по названию или пути находит место в любом объекте без ручного обхода.
 */
export function PlaceStepPicker({
  state,
  value,
  onChange,
}: {
  state: KeepItState
  value: string
  onChange: (placeId: string) => void
}) {
  const [query, setQuery] = useState('')
  const path = value ? state.pathFor(value) : []
  const current = path[path.length - 1]
  const children = current
    ? state.childPlaces(current.id)
    : state.places
        .filter((place) => place.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const q = normalizeSearch(query)
  const matches = useMemo(() => {
    if (!q) return []
    return state.places
      .map((place) => {
        const parts = state.pathFor(place.id)
        const label = parts.map((part) => part.name).join(' / ')
        return { place, label }
      })
      .filter((entry) => normalizeSearch(entry.label).includes(q))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [q, state])

  function contentsHint(placeId: string): string {
    const { places, items } = state.contentsOf(placeId)
    const parts: string[] = []
    if (places > 0) parts.push(`мест: ${places}`)
    if (items > 0) parts.push(`${items} поз.`)
    if (parts.length === 0) return 'пусто'
    return parts.join(' · ')
  }

  return (
    <div className="stack">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти место по названию или пути"
        aria-label="Поиск места для печати метки"
      />

      {q ? (
        <>
          <span className="muted">
            {matches.length > 0
              ? `Найдено: ${matches.length}${matches.length > SEARCH_LIMIT ? ` (показаны первые ${SEARCH_LIMIT})` : ''}`
              : 'Ничего не найдено'}
          </span>
          <div className="list">
            {matches.slice(0, SEARCH_LIMIT).map(({ place, label }) => (
              <button
                key={place.id}
                type="button"
                className={`list-item${place.id === value ? ' selected' : ''}`}
                onClick={() => {
                  setQuery('')
                  onChange(place.id)
                }}
              >
                <span className="stack-tight">
                  <strong>
                    {place.type === 'object' ? <ObjectBadge place={place} size="sm" /> : null}
                    {place.type !== 'object' ? <PlaceTypeIcon type={place.type} /> : null}
                    {place.name}
                  </strong>
                  <span className="muted">{label}</span>
                  <span className="muted">{contentsHint(place.id)}</span>
                </span>
                <span className="muted" aria-hidden>
                  ›
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="step-crumbs" aria-label="Путь к месту">
            <span className="step-crumb">
              <button
                type="button"
                className={`suggest-chip step-home${current ? ' neutral' : ''}`}
                aria-label="Разделы"
                title="Разделы"
                onClick={() => onChange('')}
              >
                <img src="./icons/app-192.png" alt="" />
              </button>
            </span>
            {path.map((part) => (
              <span key={part.id} className="step-crumb">
                <span className="muted">›</span>
                <button
                  type="button"
                  className={`suggest-chip${part.id === current.id ? '' : ' neutral'}`}
                  onClick={() => onChange(part.id)}
                >
                  {part.name}
                </button>
              </span>
            ))}
          </div>

          {children.length > 0 ? (
            <>
              <span className="muted">{current ? 'Или откройте вложенное место:' : 'Выберите раздел:'}</span>
              <div className="list">
                {children.map((child) => (
                  <button key={child.id} type="button" className="list-item" onClick={() => onChange(child.id)}>
                    <span className="stack-tight">
                      <strong>
                        {child.type === 'object' ? <ObjectBadge place={child} size="sm" /> : null}
                        {child.type !== 'object' ? <PlaceTypeIcon type={child.type} /> : null}
                        {child.name}
                      </strong>
                      <span className="muted">{contentsHint(child.id)}</span>
                    </span>
                    <span className="muted" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : current ? (
            <span className="muted">
              Вложенных мест нет. Выбрано «{current.name}»
              {(() => {
                const { items } = state.contentsOf(current.id)
                return items > 0 ? ` · вещей здесь и внутри: ${items} поз.` : ''
              })()}
              .
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}
