import { useState } from 'react'
import { ModeCategory } from '../components/ModeCategory'
import type { KeepItState } from '../hooks/useKeepIt'
import type { DuplicateGroup } from '../data/duplicates'
import { formatQty } from '../data/units'

type Mode = 'sum' | 'delete'

export function DuplicatesScreen({ state, placeId }: { state: KeepItState; placeId?: string }) {
  const place = placeId ? state.findPlace(placeId) : undefined
  const groups = state.duplicateGroups(placeId)
  const [keepers, setKeepers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const keeperOf = (group: DuplicateGroup) =>
    group.items.some((item) => item.id === keepers[group.key]) ? keepers[group.key]! : group.keeperId

  function placeLabel(id: string): string {
    return state
      .pathFor(id)
      .map((part) => part.name)
      .join(' / ')
  }

  async function merge(targets: DuplicateGroup[], mode: Mode) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let removed = 0
      let separate = 0
      for (const group of targets) {
        const keepId = keeperOf(group)
        const result = await state.mergeItemDuplicates(
          keepId,
          group.items.map((item) => item.id),
          mode,
        )
        removed += result.removed
        separate += result.keptSeparate
      }
      setMessage(
        `${mode === 'sum' ? 'Суммировано' : 'Удалено дублей'}: ${removed}` +
          (separate > 0 ? `. Не объединены (другие единицы измерения): ${separate}` : ''),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось объединить')
    } finally {
      setBusy(false)
    }
  }

  function mergeAll(mode: Mode) {
    const question =
      mode === 'sum'
        ? `Суммировать все группы дублей (${groups.length})? В каждой группе останется одна вещь с общим количеством.`
        : `Удалить дубли во всех группах (${groups.length})? В каждой группе останется одна вещь, остальные копии будут удалены.`
    if (window.confirm(question)) void merge(groups, mode)
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>
          Дубли вещей: {groups.length}
          {place ? ` · ${place.name}` : ''}
        </strong>
        <p className="muted">
          Одинаковые названия в одном месте или в месте и вложенном в него (например, на стеллаже и на его
          полке). Отметьте, какую вещь оставить — она останется на своём месте, — и выберите: суммировать
          количество или удалить лишние копии.
        </p>
        {groups.length > 1 ? (
          <div className="split-row">
            <button type="button" className="secondary" disabled={busy} onClick={() => mergeAll('sum')}>
              Суммировать все
            </button>
            <button type="button" className="secondary danger-text" disabled={busy} onClick={() => mergeAll('delete')}>
              Удалить все дубли
            </button>
          </div>
        ) : null}
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {groups.length === 0 ? (
        <div className="panel stack">
          <p>Дублей не найдено.</p>
          <button
            type="button"
            className="secondary"
            onClick={() => state.jump(place ? { name: 'place', placeId: place.id } : { name: 'more' })}
          >
            {place ? `К месту «${place.name}»` : 'Назад'}
          </button>
        </div>
      ) : null}

      {groups.map((group) => {
        const keepId = keeperOf(group)
        const keeper = group.items.find((item) => item.id === keepId)!
        const sameUnit = group.items.filter((item) => item.unit === keeper.unit)
        const total = sameUnit.reduce((sum, item) => sum + item.quantity, 0)
        const otherUnits = group.items.length - sameUnit.length
        return (
          <div key={group.key} className="panel stack">
            <strong>
              {keeper.name} × {group.items.length}
            </strong>
            <div className="list">
              {group.items.map((item) => (
                <label key={item.id} className="check-row">
                  <input
                    type="radio"
                    name={`keep-${group.key}`}
                    checked={item.id === keepId}
                    onChange={() => setKeepers((current) => ({ ...current, [group.key]: item.id }))}
                  />
                  <span className="stack-tight">
                    <strong>
                      {formatQty(item.quantity, item.unit)}
                      {item.id === keepId ? ' · оставить' : ''}
                    </strong>
                    <span className="muted">{placeLabel(item.placeId)}</span>
                    <span className="muted">
                      <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
                    </span>
                    {item.note ? <span className="muted">{item.note}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {otherUnits > 0 ? (
              <p className="muted">
                Копии в других единицах ({otherUnits}) при суммировании останутся отдельно.
              </p>
            ) : null}
            <div className="split-row">
              <button type="button" disabled={busy} onClick={() => void merge([group], 'sum')}>
                Суммировать = {formatQty(total, keeper.unit)}
              </button>
              <button type="button" className="secondary danger-text" disabled={busy} onClick={() => void merge([group], 'delete')}>
                Удалить дубли
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
