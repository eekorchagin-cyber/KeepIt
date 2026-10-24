import type { ReactNode } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { inventoryRoute, useInventorySession } from '../data/inventory'
import { formatLentDate } from '../data/repository'
import type { Place } from '../types'
import { requestMovePlace } from '../data/uiEvents'

/** Лист с загнутым уголком, стрелка в него и «+» — импорт списка вещей */
function ImportIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <path d="M5.5 9V5a2 2 0 0 1 2-2H15l4 4v7.5" />
      <path d="M15 3v3a1 1 0 0 0 1 1h3" />
      <path d="M5.5 13.5V19a2 2 0 0 0 2 2H14" />
      <path d="M2 11.2h7.5M7.2 8.8l2.4 2.4-2.4 2.4" />
      <path d="M10 15h4.5M10 18h3" />
      <path d="M19 16.5v6M16 19.5h6" />
    </svg>
  )
}

/** Изогнутая стрелка, входящая сверху в открытую коробку, — перенести сюда */
function MoveIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <path d="M2.5 4H8a7 7 0 0 1 7 7" />
      <path d="M12.3 8.6 15 11.3l2.7-2.7" />
      <path d="M7.5 14h15" />
      <path d="M9 14v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6" />
    </svg>
  )
}

/** Коробка и стрелка из неё вправо — перенести это место в другое */
function MoveOutIcon() {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 9h11v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3 9l2-4h7l2 4" />
      <path d="M12 14.5h9.5M18.5 11.5l3 3-3 3" />
    </svg>
  )
}

/** Календарь; с галочкой — инвентаризация проведена */
function CalendarIcon({ checked }: { checked: boolean }) {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
      {checked ? <path d="M8.5 15.5l2.5 2.5 4.5-4.5" /> : null}
    </svg>
  )
}

/** Значок-кнопка; подсказка словами при долгом нажатии — общая для всех значков (useLongPressHints) */
function ToolButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`icon-btn tool-btn${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Значки действий с местом: импорт списка, перенос сюда, инвентаризация (с датой прошлой проверки) */
export function PlaceTools({
  state,
  place,
  leading,
}: {
  state: KeepItState
  place: Place
  /** Значок перед действиями (тип места) */
  leading?: ReactNode
}) {
  const session = useInventorySession()
  const inventoryActive = session?.rootId === place.id
  const doneDate = place.inventoriedAt ? formatLentDate(place.inventoriedAt) : ''
  let inventoryLabel = doneDate ? `Инвентаризация · проверено ${doneDate}` : 'Инвентаризация · ещё не проводилась'
  if (session && inventoryActive) {
    const route = inventoryRoute(place.id, state.places)
    const ids = new Set(route.map((stop) => stop.place.id))
    inventoryLabel = `Продолжить инвентаризацию (${session.checked.filter((id) => ids.has(id)).length} из ${route.length})`
  }

  return (
    <div className="place-tools">
      {leading}
      <ToolButton
        label="Импорт списка вещей"
        onClick={() => state.navigate({ name: 'import-list', placeId: place.id })}
      >
        <ImportIcon />
      </ToolButton>
      <ToolButton
        label="Перенести сюда вещи или коробки"
        onClick={() => state.navigate({ name: 'gather-items', placeId: place.id })}
      >
        <MoveIcon />
      </ToolButton>
      {place.type !== 'object' ? (
        <ToolButton label="Перенести это место в другое (с содержимым)" onClick={requestMovePlace}>
          <MoveOutIcon />
        </ToolButton>
      ) : null}
      <ToolButton
        label={inventoryLabel}
        className={`${doneDate ? 'tool-with-date' : ''}${inventoryActive ? ' is-active' : ''}`.trim()}
        onClick={() => state.navigate({ name: 'inventory', placeId: place.id })}
      >
        <CalendarIcon checked={Boolean(doneDate)} />
        {doneDate ? <span className="tool-date">{doneDate.replace(/\.(\d{2})(\d{2})$/, '.$2')}</span> : null}
        {inventoryActive ? <span className="tool-dot" aria-hidden /> : null}
      </ToolButton>
    </div>
  )
}
