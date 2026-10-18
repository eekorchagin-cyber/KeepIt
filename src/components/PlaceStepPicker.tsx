import type { KeepItState } from '../hooks/useKeepIt'

/**
 * Пошаговый выбор места по мере вложенности: путь вверху (можно вернуться на любой уровень),
 * ниже — вложенные места текущего уровня. Выбранным считается место, где остановились.
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
  const path = value ? state.pathFor(value) : []
  const current = path[path.length - 1]
  const children = current
    ? state.childPlaces(current.id)
    : state.places
        .filter((place) => place.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return (
    <div className="stack">
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
            {children.map((child) => {
              const nested = state.childPlaces(child.id).length
              return (
                <button key={child.id} type="button" className="list-item" onClick={() => onChange(child.id)}>
                  <span className="stack-tight">
                    <strong>{child.name}</strong>
                    <span className="muted">{nested > 0 ? `внутри мест: ${nested}` : 'без вложенных мест'}</span>
                  </span>
                  <span className="muted" aria-hidden>
                    ›
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
