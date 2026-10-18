import { useState } from 'react'
import { ModeCategory } from '../components/ModeCategory'
import type { KeepItState } from '../hooks/useKeepIt'
import { normalizeSearch } from '../data/repository'
import { formatQty } from '../data/units'

/** Перенос в текущее место вещей, лежащих в местах выше по пути (полка ← стеллаж ← гараж). */
export function GatherItemsScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const ancestors = state.pathFor(placeId).slice(0, -1).reverse()
  const [sourceId, setSourceId] = useState<string | null>(
    () => ancestors.find((entry) => state.itemsInPlace(entry.id).length > 0)?.id ?? ancestors[0]?.id ?? null,
  )
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sourceItems = sourceId ? state.itemsInPlace(sourceId) : []
  const q = normalizeSearch(query)
  const visible = q
    ? sourceItems.filter((item) =>
        normalizeSearch([item.name, item.category, item.subcategory, item.note].join(' ')).includes(q),
      )
    : sourceItems

  if (!place) {
    return (
      <div className="panel">
        <p>Место не найдено</p>
      </div>
    )
  }

  const selectedIds = sourceItems.filter((item) => selected.has(item.id)).map((item) => item.id)
  const allVisibleChecked = visible.length > 0 && visible.every((item) => selected.has(item.id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current)
      for (const item of visible) {
        if (allVisibleChecked) next.delete(item.id)
        else next.add(item.id)
      }
      return next
    })
  }

  function chooseSource(id: string) {
    setSourceId(id)
    setSelected(new Set())
    setQuery('')
    setMessage(null)
  }

  async function moveSelected() {
    if (selectedIds.length === 0 || !place) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const moved = await state.relocateItems(selectedIds, place.id)
      setSelected(new Set())
      setMessage(`Перенесено в «${place.name}»: ${moved}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось перенести')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Перенести вещи в «{place.name}»</strong>
        {ancestors.length === 0 ? (
          <p className="muted">У этого места нет мест выше по пути — переносить отсюда нечего.</p>
        ) : (
          <>
            <p className="muted">Откуда взять вещи:</p>
            <div className="chip-row">
              {ancestors.map((entry) => {
                const count = state.itemsInPlace(entry.id).length
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`suggest-chip${entry.id === sourceId ? '' : ' neutral'}`}
                    onClick={() => chooseSource(entry.id)}
                  >
                    {entry.name} · {count}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {sourceId ? (
        <div className="panel stack">
          {sourceItems.length === 0 ? (
            <p className="muted">В «{state.findPlace(sourceId)?.name}» вещей непосредственно нет.</p>
          ) : (
            <>
              {sourceItems.length > 8 ? (
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Найти по названию или категории"
                  aria-label="Поиск вещей"
                />
              ) : null}
              <div className="row">
                <span className="grow muted">
                  {query ? `Найдено: ${visible.length} из ${sourceItems.length}` : `Вещей: ${sourceItems.length}`}
                </span>
                <button type="button" className="ghost" disabled={visible.length === 0} onClick={toggleVisible}>
                  {allVisibleChecked ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>
              <div className="list">
                {visible.map((item) => (
                  <label key={item.id} className="check-row">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                    <span className="stack-tight">
                      <strong>{item.name}</strong>
                      <span className="muted">
                        {formatQty(item.quantity, item.unit)} ·{' '}
                        <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      <button type="button" className="secondary" onClick={() => state.jump({ name: 'place', placeId })}>
        Готово — к месту «{place.name}»
      </button>

      <div className="panel stack sticky-actions">
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <span className="grow muted">Отмечено: {selectedIds.length}</span>
          <button type="button" disabled={busy || selectedIds.length === 0} onClick={() => void moveSelected()}>
            Перенести сюда
          </button>
        </div>
      </div>
    </div>
  )
}
