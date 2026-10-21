import { useState, type ReactNode } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { objectLabelFromPlaces } from '../data/icons'
import { ModeCategory } from '../components/ModeCategory'
import { PlaceTools } from '../components/PlaceTools'
import { isItemLent, isUnusedFreeLabel } from '../data/repository'
import { formatQty } from '../data/units'
import { BadgeCountToggle } from '../components/BadgeCountToggle'
import { FreeLabelsGroup } from '../components/FreeLabelsGroup'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { PLACE_TYPES, PLACE_TYPE_LABEL, PLACE_TYPE_SHORT, canNest } from '../data/placeTypes'
import { PlaceTypeIcon } from '../components/PlaceTypeIcon'
import type { Place } from '../types'

/**
 * Тип места значком со словом в ряду инструментов; нажатие — выбор другого типа
 * (только подходящих к тому, где место лежит, и к тому, что в нём).
 */
function PlaceTypeButton({
  state,
  place,
  misplaced,
  onError,
}: {
  state: KeepItState
  place: Place
  misplaced: boolean
  onError: (message: string | null) => void
}) {
  const parent = place.parentId ? state.findPlace(place.parentId) : undefined
  const children = state.childPlaces(place.id)
  const options = PLACE_TYPES.filter(
    (option) =>
      option.value === place.type ||
      ((!parent || canNest(parent.type, option.value)) && children.every((child) => canNest(option.value, child.type))),
  ).map((option) => ({ ...option, icon: <PlaceTypeIcon type={option.value} decorative /> }))

  return (
    <ChoiceSelect
      title={`Тип места «${place.name}»`}
      value={place.type}
      options={options}
      onChange={(type) => {
        onError(null)
        void state.changeType(place.id, type).catch((err: unknown) => {
          onError(err instanceof Error ? err.message : 'Не удалось сменить тип')
        })
      }}
      renderTrigger={(open) => (
        <button
          type="button"
          className={`icon-btn tool-btn tool-type${misplaced ? ' is-misplaced' : ''}`}
          aria-label={`Тип места: ${PLACE_TYPE_LABEL[place.type]} — нажмите, чтобы сменить`}
          title={`Тип места: ${PLACE_TYPE_LABEL[place.type]}`}
          aria-haspopup="dialog"
          onClick={open}
        >
          <PlaceTypeIcon type={place.type} decorative />
          <span className="tool-type-name">{PLACE_TYPE_SHORT[place.type]}</span>
        </button>
      )}
    />
  )
}

function NestedPlaces({ state, places }: { state: KeepItState; places: Place[] }) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const isEmpty = (place: Place) => {
    const contents = state.contentsOf(place.id)
    return contents.places + contents.items === 0
  }
  const unusedFree = places.filter((place) => isUnusedFreeLabel(place) && isEmpty(place))
  const selectedIds = places.filter((place) => selected.has(place.id)).map((place) => place.id)

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startSelecting(preselect: Place[] = []) {
    setMessage(null)
    setSelected(new Set(preselect.map((place) => place.id)))
    setSelecting(true)
  }

  async function removeSelected() {
    const chosen = places.filter((place) => selected.has(place.id))
    if (chosen.length === 0) return
    const withItems = chosen.reduce((sum, place) => sum + state.contentsOf(place.id).items, 0)
    const question =
      `Удалить отмеченные места (${chosen.length})?` +
      (withItems > 0 ? ` Вместе с ними будет удалено вещей: ${withItems}.` : ' Все они пустые.') +
      ' Это нельзя отменить.'
    if (!window.confirm(question)) return
    setBusy(true)
    try {
      const result = await state.removePlaces(chosen.map((place) => place.id))
      const removedTop = chosen.length - result.skipped.length
      setMessage(
        `Удалено мест: ${removedTop}` +
          (result.items > 0 ? `, вещей: ${result.items}` : '') +
          (result.skipped.length > 0
            ? `. Не удалены (в них есть вещи, сначала перенесите их): ${result.skipped.join(', ')}`
            : ''),
      )
      setSelected(new Set())
      setSelecting(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel stack">
      <div className="row">
        <strong className="grow">Вложенные места</strong>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => (selecting ? setSelecting(false) : startSelecting())}
        >
          {selecting ? 'Готово' : 'Выбрать'}
        </button>
      </div>
      {!selecting ? <BadgeCountToggle state={state} /> : null}

      {!selecting && unusedFree.length > 0 ? (
        <button type="button" className="place-banner" onClick={() => startSelecting(unusedFree)}>
          <strong>Пустые свободные метки: {unusedFree.length}</strong>
          <span className="muted"> — нажмите, чтобы удалить ненужные</span>
        </button>
      ) : null}

      <div className="list">
        {(selecting ? places : places.filter((place) => !unusedFree.includes(place))).map((child) =>
          selecting ? (
              <label key={child.id} className="check-row">
              <input type="checkbox" checked={selected.has(child.id)} onChange={() => toggle(child.id)} />
              <span className="stack-tight">
                <strong>
                  <PlaceTypeIcon type={child.type} />
                  {child.name}
                </strong>
                <span className="muted">{isEmpty(child) ? 'пусто' : `вещей: ${state.contentsOf(child.id).items}`}</span>
              </span>
            </label>
          ) : (
            <button
              key={child.id}
              type="button"
              className="list-item"
              onClick={() => state.navigate({ name: 'place', placeId: child.id })}
            >
              <span>
                <strong>
                  <PlaceTypeIcon type={child.type} />
                  {child.name}
                </strong>
                <span className="place-code muted">{child.code}</span>
              </span>
              <span className="badge">{state.placeBadge(child.id)}</span>
            </button>
          ),
        )}
      </div>
      {!selecting ? <FreeLabelsGroup state={state} places={unusedFree} /> : null}

      {selecting ? (
        <div className="stack sticky-actions panel">
          <div className="row">
            <strong className="grow">Отмечено: {selectedIds.length}</strong>
            {unusedFree.length > 0 ? (
              <button type="button" className="ghost" onClick={() => startSelecting(unusedFree)}>
                Пустые свободные метки
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="danger"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void removeSelected()}
          >
            Удалить отмеченные ({selectedIds.length})
          </button>
        </div>
      ) : null}

      {message ? <p className="muted">{message}</p> : null}
    </div>
  )
}

export function PlaceScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const path = state.pathFor(placeId)
  const children = state.childPlaces(placeId)
  const items = state.itemsInPlace(placeId)
  const uncategorized = state.uncategorizedItems(placeId).length
  const duplicates = state.duplicateGroups(placeId).length
  const [typeError, setTypeError] = useState<string | null>(null)
  if (!place) {
    return (
      <div className="panel stack">
        <p>Место не найдено.</p>
        <button type="button" onClick={() => state.jump({ name: 'home' })}>
          На главную
        </button>
      </div>
    )
  }

  const parentPlace = place.parentId ? state.findPlace(place.parentId) : undefined
  const misplacedIn = parentPlace && !canNest(parentPlace.type, place.type) ? parentPlace : null

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="place-head">
          <div className="breadcrumbs place-head-path">
            <button type="button" onClick={() => state.navigate({ name: 'object', objectKey: place.objectKey })}>
              {objectLabelFromPlaces(place.objectKey, state.places)}
            </button>
            {path.slice(1, -1).map((part) => (
              <span key={part.id}>
                /
                <button type="button" onClick={() => state.navigate({ name: 'place', placeId: part.id })}>
                  {part.name}
                </button>
              </span>
            ))}
          </div>
          <PlaceTools
            state={state}
            place={place}
            leading={
              place.type !== 'object' ? (
                <PlaceTypeButton state={state} place={place} misplaced={Boolean(misplacedIn)} onError={setTypeError} />
              ) : null
            }
          />
        </div>
        {misplacedIn ? (
          <p className="place-type-warning">
            Это место — «{PLACE_TYPE_LABEL[place.type]}», а лежит в «{misplacedIn.name}» (тип «
            {PLACE_TYPE_LABEL[misplacedIn.type]}») — так быть не должно. Нажмите значок «{PLACE_TYPE_SHORT[place.type]}»
            выше и выберите другой тип (например, «Коробка») или перенесите место через «···» → «Перенести».
          </p>
        ) : null}
        {typeError ? <p className="error">{typeError}</p> : null}
        {duplicates > 0 ? (
          <button
            type="button"
            className="place-banner"
            onClick={() => state.navigate({ name: 'duplicates', placeId })}
          >
            <strong>Дубли вещей: {duplicates}</strong>
            <span className="muted"> — суммировать или удалить</span>
          </button>
        ) : null}
        {uncategorized > 0 ? (
          <button
            type="button"
            className="place-banner"
            onClick={() => state.navigate({ name: 'categorize', placeId })}
          >
            <strong>Без категории: {uncategorized}</strong>
            <span className="muted"> — нажмите, чтобы разобрать</span>
          </button>
        ) : null}
      </div>

      <PlaceSearch key={placeId} state={state} place={place}>
        {children.length > 0 ? <NestedPlaces key={placeId} state={state} places={children} /> : null}

        {items.length > 0 ? (
          <div className="panel stack">
            <strong>Содержимое здесь</strong>
            <div className="list">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="list-item"
                  onClick={() => state.navigate({ name: 'item', itemId: item.id })}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <span className="muted">
                      <ModeCategory
                        mode={item.mode}
                        category={item.category}
                        subcategory={item.subcategory}
                        suffix={item.needsFill ? ' · заполнить' : isItemLent(item) ? ` · у ${item.lentTo}` : ''}
                      />
                    </span>
                  </span>
                  <span className={`badge${isItemLent(item) ? ' warn' : ''}`}>
                    {item.needsFill
                      ? 'заполнить'
                      : isItemLent(item)
                        ? `у ${item.lentTo}`
                        : formatQty(item.quantity, item.unit)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </PlaceSearch>
    </div>
  )
}

/** Последний запрос в каждом месте — сохраняется при возврате из карточки вещи. */
const lastQueryByPlace = new Map<string, string>()

/** Поиск по названию внутри места на любой глубине; пока идёт поиск, обычное содержимое скрыто. */
function PlaceSearch({ state, place, children }: { state: KeepItState; place: Place; children: ReactNode }) {
  const [query, setQueryState] = useState(() => lastQueryByPlace.get(place.id) ?? '')
  const contents = state.contentsOf(place.id)

  function setQuery(value: string) {
    lastQueryByPlace.set(place.id, value)
    setQueryState(value)
  }

  if (contents.places + contents.items === 0) return <>{children}</>

  const results = state.searchInPlace(place.id, query)
  const found = results.places.length + results.items.length

  function relativePath(placeId: string): string {
    const path = state.pathFor(placeId)
    const index = path.findIndex((part) => part.id === place.id)
    const inner = path.slice(index + 1).map((part) => part.name)
    return inner.length ? inner.join(' / ') : 'здесь'
  }

  return (
    <>
      <div className="panel stack">
        <div className="row">
          <input
            className="grow"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Поиск в «${place.name}»`}
            aria-label={`Поиск по названию в «${place.name}» и вложенных местах`}
          />
          {query ? (
            <button type="button" className="ghost" onClick={() => setQuery('')}>
              Сбросить
            </button>
          ) : null}
        </div>
        {query.trim() ? (
          <span className="muted">
            {found > 0 ? `Найдено: ${found} (во всех вложенных местах)` : 'Ничего не найдено'}
          </span>
        ) : null}
      </div>

      {query.trim() ? (
        found > 0 ? (
          <div className="panel stack">
            <div className="list">
              {results.places.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="list-item"
                  onClick={() => state.navigate({ name: 'place', placeId: entry.id })}
                >
                  <span className="stack-tight">
                    <strong>{entry.name}</strong>
                    <span className="muted">Место · {entry.parentId ? relativePath(entry.parentId) : ''}</span>
                  </span>
                  <span className="badge">{state.placeBadge(entry.id)}</span>
                </button>
              ))}
              {results.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="list-item"
                  onClick={() => state.navigate({ name: 'item', itemId: item.id })}
                >
                  <span className="stack-tight">
                    <strong>{item.name}</strong>
                    <span className="muted">
                      <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
                    </span>
                    <span className="muted">{relativePath(item.placeId)}</span>
                  </span>
                  <span className={`badge${isItemLent(item) ? ' warn' : ''}`}>
                    {isItemLent(item) ? `у ${item.lentTo}` : formatQty(item.quantity, item.unit)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null
      ) : (
        children
      )}
    </>
  )
}
