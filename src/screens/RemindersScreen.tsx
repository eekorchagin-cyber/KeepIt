import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import {
  SERVICE_SOON_DAYS,
  formatIsoDate,
  intervalLabel,
  serviceDueLabel,
  serviceStatus,
  todayIso,
  type ServiceStatus,
} from '../data/service'
import type { Item } from '../types'

const SECTIONS: Array<{ status: ServiceStatus; title: string }> = [
  { status: 'overdue', title: 'Просрочено' },
  { status: 'soon', title: `Скоро — в ближайшие ${SERVICE_SOON_DAYS} дней` },
  { status: 'planned', title: 'Запланировано' },
]

export function RemindersScreen({ state }: { state: KeepItState }) {
  const items = state.serviceItems()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function done(item: Item) {
    setBusyId(item.id)
    setError(null)
    setMessage(null)
    try {
      const next = await state.serviceDone(item.id, todayIso())
      setMessage(
        `ТО «${item.name}» отмечено.` +
          (next.serviceNextAt
            ? ` Следующее — ${formatIsoDate(next.serviceNextAt)}.`
            : ' Укажите дату следующего ТО в карточке вещи.'),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusyId(null)
    }
  }

  function placeLabel(item: Item): string {
    return state
      .pathFor(item.placeId)
      .map((part) => part.name)
      .join(' / ')
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Техническое обслуживание</strong>
        <p className="muted">
          Даты ТО задаются в карточке оборудования. «ТО проведено» записывает сегодняшнюю дату и считает
          следующую по периодичности.
        </p>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {items.length === 0 ? (
        <div className="panel stack">
          <p>Запланированных ТО нет.</p>
          <p className="muted">
            Откройте карточку оборудования (категория «Оборудование») и укажите даты в блоке «Техническое
            обслуживание».
          </p>
        </div>
      ) : null}

      {SECTIONS.map(({ status, title }) => {
        const list = items.filter((item) => serviceStatus(item) === status)
        if (list.length === 0) return null
        return (
          <div key={status} className="panel stack">
            <strong>
              {title} · {list.length}
            </strong>
            <div className="list">
              {list.map((item) => (
                <div key={item.id} className="check-row reminder-row">
                  <button
                    type="button"
                    className="ghost reminder-open"
                    onClick={() => state.navigate({ name: 'item', itemId: item.id })}
                  >
                    <span className="stack-tight">
                      <strong>{item.name}</strong>
                      <span className="muted">{placeLabel(item)}</span>
                      <span>
                        ТО {formatIsoDate(item.serviceNextAt)}{' '}
                        <span className={`badge service-${status}`}>{serviceDueLabel(item)}</span>
                      </span>
                      <span className="muted">
                        Последнее: {formatIsoDate(item.serviceLastAt) || 'не указано'} ·{' '}
                        {intervalLabel(item.serviceIntervalMonths ?? 0)}
                      </span>
                    </span>
                  </button>
                  {status !== 'planned' ? (
                    <button
                      type="button"
                      className="suggest-chip"
                      disabled={busyId === item.id}
                      onClick={() => void done(item)}
                    >
                      ТО проведено
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
