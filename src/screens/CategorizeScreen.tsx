import { useMemo, useState } from 'react'
import { CategoryPicker, CategorySheet } from '../components/CategoryPicker'
import type { KeepItState } from '../hooks/useKeepIt'
import { formatCategoryPath } from '../data/categories'
import { suggestCategory, type CategorySuggestion } from '../data/listImport/suggestCategory'
import { formatQty } from '../data/units'
import type { AccountingMode, Item } from '../types'

type Group = {
  key: string
  suggestion: CategorySuggestion | null
  items: Item[]
}

const NO_HINT = '__none__'

export function CategorizeScreen({ state, placeId }: { state: KeepItState; placeId?: string }) {
  const [scope, setScope] = useState<'place' | 'all'>(placeId ? 'place' : 'all')
  const place = placeId ? state.findPlace(placeId) : undefined
  const items = state.uncategorizedItems(scope === 'place' ? placeId : undefined)

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>
          Без категории: {items.length}
          {place && scope === 'place' ? ` · ${place.name}` : ''}
        </strong>
        <p className="muted">
          У каждой вещи: «Принять» подсказку, «Выбрать категорию» из справочника или «Удалить»
          неверно распознанную. Выбор запоминается и подсказывается в следующий раз.
        </p>
        {place ? (
          <div className="split-row">
            <button
              type="button"
              className={scope === 'place' ? undefined : 'secondary'}
              onClick={() => setScope('place')}
            >
              Только это место
            </button>
            <button
              type="button"
              className={scope === 'all' ? undefined : 'secondary'}
              onClick={() => setScope('all')}
            >
              Все места
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="panel stack">
          <p>Все вещи разобраны — категории назначены.</p>
          {place ? (
            <button type="button" onClick={() => state.jump({ name: 'place', placeId: place.id })}>
              К месту «{place.name}»
            </button>
          ) : (
            <button type="button" onClick={() => state.jump({ name: 'home' })}>
              На главную
            </button>
          )}
        </div>
      ) : (
        <CategorizeList key={scope} state={state} items={items} />
      )}
    </div>
  )
}

function CategorizeList({ state, items }: { state: KeepItState; items: Item[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const item of items) {
      const suggestion = suggestCategory(item.name, state.categories, state.itemNames)
      const key = suggestion ? `${suggestion.category}|${suggestion.subcategory}` : NO_HINT
      const group = map.get(key) ?? { key, suggestion, items: [] }
      group.items.push(item)
      map.set(key, group)
    }
    return [...map.values()].sort((a, b) => {
      if (!a.suggestion) return 1
      if (!b.suggestion) return -1
      return formatCategoryPath(a.suggestion.category, a.suggestion.subcategory).localeCompare(
        formatCategoryPath(b.suggestion.category, b.suggestion.subcategory),
        'ru',
      )
    })
  }, [items, state.categories, state.itemNames])

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pickFor, setPickFor] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const present = new Set(items.map((item) => item.id))
  const selectedIds = [...selected].filter((id) => present.has(id))

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleMany(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  function assign(ids: string[], category: string, subcategory: string) {
    if (ids.length === 0) return
    void run(async () => {
      await state.assignCategories(ids, category, subcategory)
      toggleMany(ids, false)
      return `Назначено «${formatCategoryPath(category, subcategory)}»: ${ids.length}`
    })
  }

  function remove(ids: string[]) {
    if (ids.length === 0) return
    const names = items.filter((item) => ids.includes(item.id)).map((item) => item.name)
    const question =
      names.length === 1
        ? `Удалить «${names[0]}»? Вещь исчезнет из места хранения.`
        : `Удалить отмеченные вещи (${names.length})? Они исчезнут из мест хранения.`
    if (!window.confirm(question)) return
    void run(async () => {
      const removed = await state.removeItems(ids)
      toggleMany(ids, false)
      return `Удалено: ${removed}`
    })
  }

  function changeMode(mode: AccountingMode) {
    if (selectedIds.length === 0) return
    void run(async () => {
      const changed = await state.setModeFor(selectedIds, mode)
      const label = mode === 'durable' ? 'постоянное хранение' : 'расходный материал'
      return changed > 0 ? `Режим «${label}»: ${changed}` : 'Режим не изменён'
    })
  }

  function placeLabel(item: Item): string {
    return state.findPlace(item.placeId)?.name ?? ''
  }

  return (
    <>
      {groups.map((group) => {
        const ids = group.items.map((item) => item.id)
        const checkedIds = ids.filter((id) => selected.has(id))
        const allChecked = checkedIds.length === ids.length
        return (
          <div key={group.key} className="panel stack">
            <label className="row">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => toggleMany(ids, e.target.checked)}
                aria-label="Отметить группу"
              />
              <span className="grow">
                <strong>
                  {group.suggestion
                    ? formatCategoryPath(group.suggestion.category, group.suggestion.subcategory)
                    : 'Без подсказки'}
                </strong>
                <span className="muted">
                  {' '}
                  · {group.items.length}
                  {group.suggestion?.source === 'dictionary' ? ' · из справочника' : ''}
                </span>
              </span>
            </label>

            <div className="list">
              {group.items.map((item) => (
                <div key={item.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                    aria-label={`Отметить ${item.name}`}
                  />
                  <span className="stack-tight">
                    <strong>{item.name}</strong>
                    <span className="muted">
                      {formatQty(item.quantity, item.unit)}
                      {placeLabel(item) ? ` · ${placeLabel(item)}` : ''}
                    </span>
                    <span className="chip-row">
                      {group.suggestion ? (
                        <button
                          type="button"
                          className="suggest-chip"
                          disabled={busy}
                          onClick={() =>
                            assign([item.id], group.suggestion!.category, group.suggestion!.subcategory)
                          }
                        >
                          Принять
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="suggest-chip neutral"
                        disabled={busy}
                        onClick={() => setPickFor(item)}
                      >
                        {group.suggestion ? 'Другая категория' : 'Выбрать категорию'}
                      </button>
                      <button
                        type="button"
                        className="suggest-chip danger"
                        disabled={busy}
                        onClick={() => remove([item.id])}
                      >
                        Удалить
                      </button>
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {group.suggestion ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  assign(
                    checkedIds.length > 0 ? checkedIds : ids,
                    group.suggestion!.category,
                    group.suggestion!.subcategory,
                  )
                }
              >
                {checkedIds.length > 0
                  ? `Принять для отмеченных (${checkedIds.length})`
                  : `Принять для всех (${ids.length})`}
              </button>
            ) : null}
          </div>
        )
      })}

      <div className="panel stack sticky-actions">
        <div className="row">
          <strong className="grow">Отмечено: {selectedIds.length}</strong>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              toggleMany(
                items.map((item) => item.id),
                selectedIds.length !== items.length,
              )
            }
          >
            {selectedIds.length === items.length ? 'Снять все' : 'Выбрать все'}
          </button>
          {selectedIds.length > 0 ? (
            <button type="button" className="ghost danger-text" disabled={busy} onClick={() => remove(selectedIds)}>
              Удалить
            </button>
          ) : null}
        </div>
        {selectedIds.length > 0 ? (
          <>
            <CategoryPicker
              tree={state.categories}
              category=""
              subcategory=""
              fieldLabel="Назначить отмеченным"
              onChange={({ category, subcategory }) => assign(selectedIds, category, subcategory)}
            />
            <div className="split-row">
              <button type="button" className="secondary" disabled={busy} onClick={() => changeMode('durable')}>
                Постоянное
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => changeMode('consumable')}>
                Расходник
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Галочки — для действий сразу с несколькими вещами</p>
        )}
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {pickFor ? (
        <CategorySheet
          tree={state.categories}
          title={`Категория для «${pickFor.name}»`}
          onClose={() => setPickFor(null)}
          onPick={({ category, subcategory }) => {
            const id = pickFor.id
            setPickFor(null)
            assign([id], category, subcategory)
          }}
        />
      ) : null}
    </>
  )
}
