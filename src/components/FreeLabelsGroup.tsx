import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import type { Place } from '../types'

/**
 * Пустые свободные метки одной строкой «Свободные метки: N» — чтобы не занимали список мест.
 * По нажатию раскрывается список; можно удалить все пустые разом.
 */
export function FreeLabelsGroup({ state, places }: { state: KeepItState; places: Place[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (places.length === 0) return message ? <p className="muted">{message}</p> : null

  async function removeAll() {
    if (
      !window.confirm(
        `Удалить пустые свободные метки (${places.length})? Если какие-то уже наклеены на коробки, их QR-коды перестанут работать.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await state.removePlaces(places.map((place) => place.id))
      setMessage(`Удалено свободных меток: ${places.length - result.skipped.length}`)
      setOpen(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <button
        type="button"
        className="list-item free-labels-row"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="stack-tight">
          <strong>Свободные метки: {places.length}</strong>
          <span className="muted">Пустые заготовки — название дадите при сканировании</span>
        </span>
        <span className="muted" aria-hidden>
          {open ? '⌃' : '⌄'}
        </span>
      </button>
      {open ? (
        <div className="list free-labels-list">
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              className="list-item"
              onClick={() => state.navigate({ name: 'place', placeId: place.id })}
            >
              <span>
                <strong>{place.name}</strong>
                <span className="place-code muted">{place.code}</span>
              </span>
            </button>
          ))}
          <button type="button" className="secondary danger-text" disabled={busy} onClick={() => void removeAll()}>
            Удалить все пустые ({places.length})
          </button>
        </div>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  )
}
