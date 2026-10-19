import { useState } from 'react'
import { ModeCategory } from '../components/ModeCategory'
import type { KeepItState } from '../hooks/useKeepIt'
import type { DuplicateGroup } from '../data/duplicates'
import { formatQty } from '../data/units'

function scrollToTop() {
  document.querySelector('.app-main')?.scrollTo({ top: 0, behavior: 'smooth' })
}

export function DuplicatesScreen({ state, placeId }: { state: KeepItState; placeId?: string }) {
  const place = placeId ? state.findPlace(placeId) : undefined
  const groups = state.duplicateGroups(placeId)
  /** Отмеченные «оставить» в каждой группе; по умолчанию — одна лучшая копия */
  const [kept, setKept] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const keptOf = (group: DuplicateGroup): string[] => {
    const chosen = (kept[group.key] ?? [group.keeperId]).filter((id) => group.items.some((item) => item.id === id))
    return chosen
  }

  /** Основная копия (в неё суммируем и ей передаём категорию): лучшая из отмеченных */
  const mainOf = (group: DuplicateGroup): string => {
    const chosen = keptOf(group)
    if (chosen.includes(group.keeperId)) return group.keeperId
    return chosen[0] ?? group.keeperId
  }

  function toggle(group: DuplicateGroup, itemId: string) {
    setKept((current) => {
      const now = keptOf(group)
      const next = now.includes(itemId) ? now.filter((id) => id !== itemId) : [...now, itemId]
      return { ...current, [group.key]: next }
    })
  }

  function placeLabel(id: string): string {
    return state
      .pathFor(id)
      .map((part) => part.name)
      .join(' / ')
  }

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить')
    } finally {
      setBusy(false)
      scrollToTop()
    }
  }

  /** Суммировать все копии группы в основную */
  async function sumGroup(group: DuplicateGroup) {
    const result = await state.mergeItemDuplicates(
      mainOf(group),
      group.items.map((item) => item.id),
      'sum',
    )
    return result
  }

  /** Удалить неотмеченные копии; если отмечено несколько — оставшиеся больше не считаются дублями */
  async function deleteUnchecked(group: DuplicateGroup) {
    const keep = keptOf(group)
    const remove = group.items.filter((item) => !keep.includes(item.id)).map((item) => item.id)
    if (remove.length === 0) {
      state.keepDuplicates(keep)
      return 0
    }
    const result = await state.mergeItemDuplicates(mainOf(group), [mainOf(group), ...remove], 'delete')
    if (keep.length > 1) state.keepDuplicates(keep)
    return result.removed
  }

  function keepAll(group: DuplicateGroup) {
    state.keepDuplicates(group.items.map((item) => item.id))
    setMessage(`«${group.items[0]!.name}»: оставлены все копии (${group.items.length}) как разные вещи.`)
    scrollToTop()
  }

  function sumAll() {
    if (!window.confirm(`Суммировать все группы дублей (${groups.length})? В каждой останется одна вещь с общим количеством.`)) {
      return
    }
    void run(async () => {
      let removed = 0
      let separate = 0
      for (const group of groups) {
        const result = await sumGroup(group)
        removed += result.removed
        separate += result.keptSeparate
      }
      return `Суммировано копий: ${removed}` + (separate > 0 ? `. Не объединены (другие единицы): ${separate}` : '')
    })
  }

  function deleteAllUnchecked() {
    if (
      !window.confirm(
        `Во всех группах (${groups.length}) удалить копии без отметки «Оставить»? Отмеченные останутся на своих местах.`,
      )
    ) {
      return
    }
    void run(async () => {
      let removed = 0
      for (const group of groups) removed += await deleteUnchecked(group)
      return `Удалено копий: ${removed}`
    })
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>
          Дубли вещей: {groups.length}
          {place ? ` · ${place.name}` : ''}
        </strong>
        <p className="muted">
          Одинаковые названия в одном месте или в месте и вложенном в него. Отметьте «Оставить» у нужных копий —
          можно одну, несколько или все — и выберите действие. «Суммировать» сложит количество в одну отмеченную вещь.
        </p>
        {groups.length > 1 ? (
          <div className="split-row">
            <button type="button" className="secondary" disabled={busy} onClick={sumAll}>
              Суммировать все
            </button>
            <button type="button" className="secondary danger-text" disabled={busy} onClick={deleteAllUnchecked}>
              Удалить неотмеченные во всех
            </button>
          </div>
        ) : null}
        {busy ? <p className="muted">Выполняю…</p> : null}
        {message ? <p className="duplicates-result">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {groups.length === 0 ? (
        <div className="panel stack">
          <p>Дублей не найдено.</p>
          <button type="button" className="secondary" onClick={() => state.goBack()}>
            {place ? `К месту «${place.name}»` : 'Назад'}
          </button>
        </div>
      ) : null}

      {groups.map((group) => {
        const keep = keptOf(group)
        const mainId = mainOf(group)
        const main = group.items.find((item) => item.id === mainId)!
        const sameUnit = group.items.filter((item) => item.unit === main.unit)
        const total = sameUnit.reduce((sum, item) => sum + item.quantity, 0)
        const otherUnits = group.items.length - sameUnit.length
        const removeCount = group.items.length - keep.length
        return (
          <div key={group.key} className="panel stack">
            <strong>
              {main.name} × {group.items.length}
            </strong>
            <div className="list">
              {group.items.map((item) => (
                <label key={item.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={keep.includes(item.id)}
                    onChange={() => toggle(group, item.id)}
                    aria-label="Оставить"
                  />
                  <span className="stack-tight">
                    <strong>
                      {formatQty(item.quantity, item.unit)}
                      {keep.includes(item.id) ? ' · оставить' : ' · удалить'}
                    </strong>
                    <span className="muted">{placeLabel(item.placeId)}</span>
                    <span className="muted">
                      <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
                    </span>
                    {item.needsFill ? <span className="muted">Требует заполнения</span> : null}
                    {item.note ? <span className="muted">{item.note}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {otherUnits > 0 ? (
              <p className="muted">Копии в других единицах ({otherUnits}) при суммировании останутся отдельно.</p>
            ) : null}
            <button
              type="button"
              className="secondary danger-text"
              disabled={busy || keep.length === 0 || removeCount === 0}
              onClick={() =>
                void run(async () => `«${main.name}»: удалено копий: ${await deleteUnchecked(group)}`)
              }
            >
              {keep.length === 0 ? 'Отметьте, что оставить' : `Удалить неотмеченные (${removeCount})`}
            </button>
            <div className="split-row">
              <button
                type="button"
                disabled={busy || keep.length === 0}
                onClick={() =>
                  void run(async () => {
                    const result = await sumGroup(group)
                    return (
                      `«${main.name}»: суммировано = ${formatQty(result.quantity, main.unit)}` +
                      (result.keptSeparate > 0 ? `, отдельно оставлено (другие единицы): ${result.keptSeparate}` : '')
                    )
                  })
                }
              >
                Суммировать = {formatQty(total, main.unit)}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => keepAll(group)}>
                Оставить все
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
