import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import {
  SERVICE_INTERVALS,
  SERVICE_SOON_DAYS,
  addMonths,
  formatIsoDate,
  intervalLabel,
  isIsoDate,
  serviceDueLabel,
  serviceStatus,
  todayIso,
  tracksService,
} from '../data/service'
import type { Item } from '../types'

/** Блок «Техническое обслуживание» в карточке вещи. */
export function ServicePanel({ state, item }: { state: KeepItState; item: Item }) {
  const [editing, setEditing] = useState(false)
  const [lastAt, setLastAt] = useState('')
  const [nextAt, setNextAt] = useState('')
  const [interval, setIntervalMonths] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  const tracked = tracksService(item) || added
  const status = serviceStatus(item)

  function openEditor() {
    setLastAt(item.serviceLastAt ?? '')
    setNextAt(item.serviceNextAt ?? '')
    setIntervalMonths(item.serviceIntervalMonths ?? 0)
    setError(null)
    setEditing(true)
  }

  function changeLast(value: string) {
    setLastAt(value)
    if (interval > 0 && isIsoDate(value)) setNextAt(addMonths(value, interval))
  }

  function changeInterval(value: number) {
    setIntervalMonths(value)
    if (value > 0 && isIsoDate(lastAt)) setNextAt(addMonths(lastAt, value))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await state.saveService(item.id, { lastAt, nextAt, intervalMonths: interval })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  async function doneToday() {
    setBusy(true)
    setError(null)
    try {
      await state.serviceDone(item.id, todayIso())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  if (!tracked) {
    return (
      <div className="chip-row">
        <button
          type="button"
          className="suggest-chip neutral"
          onClick={() => {
            setAdded(true)
            openEditor()
          }}
        >
          Добавить ТО
        </button>
      </div>
    )
  }

  const interval0 = item.serviceIntervalMonths ?? 0

  return (
    <div className="panel stack">
      <strong>Техническое обслуживание</strong>
      <div className="stack-tight">
        <span>
          Последнее ТО:{' '}
          <strong className="inline">{formatIsoDate(item.serviceLastAt) || 'не указано'}</strong>
        </span>
        <span>
          Следующее ТО:{' '}
          <strong className="inline">{formatIsoDate(item.serviceNextAt) || 'не запланировано'}</strong>
          {isIsoDate(item.serviceNextAt) ? (
            <span className={`badge service-${status}`}> {serviceDueLabel(item)}</span>
          ) : null}
        </span>
        <span className="muted">Периодичность: {intervalLabel(interval0)}</span>
      </div>
      {error && !editing ? <p className="error">{error}</p> : null}
      <div className="split-row">
        <button type="button" disabled={busy} onClick={() => void doneToday()}>
          ТО проведено сегодня
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={openEditor}>
          Изменить даты
        </button>
      </div>
      {interval0 === 0 ? (
        <p className="muted">
          Без интервала следующую дату после ТО нужно указать вручную — или задайте периодичность в «Изменить
          даты».
        </p>
      ) : null}

      {editing ? (
        <div className="sheet-backdrop" onClick={() => setEditing(false)} role="presentation">
          <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
            <div className="row">
              <strong className="grow">ТО: {item.name}</strong>
              <button type="button" className="icon-btn" onClick={() => setEditing(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="stack">
              <label className="field">
                Последнее ТО
                <input type="date" value={lastAt} onChange={(e) => changeLast(e.target.value)} />
              </label>
              <label className="field">
                Периодичность
                <select value={interval} onChange={(e) => changeInterval(Number(e.target.value))}>
                  {SERVICE_INTERVALS.map((months) => (
                    <option key={months} value={months}>
                      {months === 0 ? 'Не задана (следующее — вручную)' : intervalLabel(months)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Следующее ТО
                <input type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
              </label>
              <p className="muted">
                По дате следующего ТО программа напомнит заранее — за {SERVICE_SOON_DAYS} дней — в разделе
                «Напоминания».
              </p>
              {error ? <p className="error">{error}</p> : null}
              <button type="button" disabled={busy} onClick={() => void save()}>
                Сохранить
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
