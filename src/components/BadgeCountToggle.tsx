import type { KeepItState } from '../hooks/useKeepIt'

/** Что считать на бейджах мест: сумму количества (например 200 гвоздей) или позиции (2 упаковки) */
export function BadgeCountToggle({ state }: { state: KeepItState }) {
  const mode = state.badgeCount
  return (
    <div className="badge-toggle" role="group" aria-label="Что считать на бейджах">
      <button
        type="button"
        className={`suggest-chip${mode === 'quantity' ? '' : ' neutral'}`}
        aria-pressed={mode === 'quantity'}
        onClick={() => void state.setBadgeCount('quantity')}
      >
        Количество
      </button>
      <button
        type="button"
        className={`suggest-chip${mode === 'positions' ? '' : ' neutral'}`}
        aria-pressed={mode === 'positions'}
        onClick={() => void state.setBadgeCount('positions')}
      >
        Позиции
      </button>
    </div>
  )
}
