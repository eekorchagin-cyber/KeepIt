import { useState } from 'react'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { MoveQrScan } from '../components/MoveItemSheet'
import type { KeepItState } from '../hooks/useKeepIt'
import {
  addFound,
  checkableItems,
  expectedQuantity,
  inventoryRoute,
  isFullyMoved,
  movedQuantity,
  saveInventory,
  startInventory,
  summarizeInventory,
  updateInventory,
  useInventorySession,
  type FoundEntry,
  type InventoryMark,
  type InventorySession,
  type RouteStop,
} from '../data/inventory'
import { findName } from '../data/itemNames'
import { formatLentDate, isItemLent, normalizeSearch } from '../data/repository'
import { todayIso } from '../data/service'
import { UNIT_LABELS, formatQty, isCountableUnit, unitOptionsFor } from '../data/units'
import type { AccountingMode, Item, Place, Screen, UnitCode } from '../types'

type View = { name: 'route' } | { name: 'place'; placeId: string } | { name: 'scan' } | { name: 'report' }

function fullPath(state: KeepItState, placeId: string): string {
  return state
    .pathFor(placeId)
    .map((part) => part.name)
    .join(' / ')
}

/** Путь внутри проверяемого места; для него самого — его название */
function innerPath(state: KeepItState, rootId: string, placeId: string): string {
  const path = state.pathFor(placeId)
  const index = path.findIndex((part) => part.id === rootId)
  if (index < 0) return fullPath(state, placeId)
  const inner = path.slice(index + 1).map((part) => part.name)
  return inner.length ? inner.join(' / ') : (path[index]?.name ?? '')
}

/** Вещи к проверке в месте: без переданных и без тех, что целиком нашлись в других местах */
function itemsToCheck(state: KeepItState, session: InventorySession, placeId: string): Item[] {
  return checkableItems(placeId, state.items).filter((item) => !isFullyMoved(session, item))
}

function parseQuantity(raw: string, integer: boolean): number | null {
  const value = Number(raw.replace(',', '.'))
  if (!raw.trim() || !Number.isFinite(value) || value < 0) return null
  if (integer && !Number.isInteger(value)) return null
  return value
}

function needsInteger(item: { mode: AccountingMode; unit: UnitCode }): boolean {
  return item.mode === 'durable' || isCountableUnit(item.unit)
}

export function InventoryScreen({
  state,
  screen,
}: {
  state: KeepItState
  screen: Extract<Screen, { name: 'inventory' }>
}) {
  const placeId = screen.placeId
  const session = useInventorySession()
  const root = state.findPlace(placeId)
  // Вид — часть экрана, поэтому «←» вверху возвращает к предыдущему виду (список мест), а не из инвентаризации
  const view: View =
    screen.view === 'stop' && screen.stopId
      ? { name: 'place', placeId: screen.stopId }
      : screen.view === 'scan'
        ? { name: 'scan' }
        : screen.view === 'report'
          ? { name: 'report' }
          : { name: 'route' }
  const toScreen = (next: View): Screen =>
    next.name === 'place'
      ? { name: 'inventory', placeId, view: 'stop', stopId: next.placeId }
      : next.name === 'route'
        ? { name: 'inventory', placeId }
        : { name: 'inventory', placeId, view: next.name }
  /** Из списка мест — новый шаг истории */
  const open = (next: View) => state.navigate(toScreen(next))
  /** Переход внутри шага (следующее место, место по QR) — без нового шага истории */
  const replace = (next: View) => state.replaceScreen(toScreen(next))
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!root) {
    return (
      <div className="panel">
        <p>Место не найдено</p>
      </div>
    )
  }

  if (!session || session.rootId !== placeId) {
    return <InventoryStart state={state} root={root} session={session} result={result} />
  }

  const route = inventoryRoute(placeId, state.places)
  const routeIds = new Set(route.map((stop) => stop.place.id))

  function openNext(afterId: string | null) {
    const current = session!
    const start = afterId ? route.findIndex((stop) => stop.place.id === afterId) + 1 : 0
    const ordered = [...route.slice(start), ...route.slice(0, start)]
    const next = ordered.find((stop) => !current.checked.includes(stop.place.id) && stop.place.id !== afterId)
    replace(next ? { name: 'place', placeId: next.place.id } : { name: 'report' })
  }

  if (view.name === 'place') {
    const stop = route.find((entry) => entry.place.id === view.placeId)
    if (stop) {
      return (
        <PlaceCheck
          key={stop.place.id}
          state={state}
          session={session}
          root={root}
          stop={stop}
          index={route.indexOf(stop)}
          total={route.length}
          onBack={() => state.goBack()}
          onChecked={() => openNext(stop.place.id)}
        />
      )
    }
  }

  if (view.name === 'scan') {
    return (
      <div className="panel stack">
        <strong>QR-метка места</strong>
        {error ? <p className="error">{error}</p> : null}
        <MoveQrScan
          busy={false}
          places={state.places}
          hint="Наведите камеру на QR-метку коробки, полки или стеллажа"
          actionLabel="Открыть место по коду"
          onResolved={(id) => {
            if (routeIds.has(id)) {
              setError(null)
              replace({ name: 'place', placeId: id })
            } else {
              setError(`Это место не входит в проверку «${root.name}». Отсканируйте другую метку.`)
              state.goBack()
            }
          }}
          onFail={setError}
        />
        <button type="button" className="ghost" onClick={() => state.goBack()}>
          ← К списку мест
        </button>
      </div>
    )
  }

  if (view.name === 'report') {
    return (
      <InventoryReport
        state={state}
        session={session}
        root={root}
        route={route}
        onBack={() => state.goBack()}
        onApplied={(text) => {
          setResult(text)
          state.goBack()
        }}
      />
    )
  }

  const checked = session.checked.filter((id) => routeIds.has(id)).length
  const nextStop = route.find((stop) => !session.checked.includes(stop.place.id))

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Инвентаризация «{root.name}»</strong>
        <progress className="progress-bar" max={route.length} value={checked} />
        <span className="muted">
          Проверено мест: {checked} из {route.length}
        </span>
        {error ? <p className="error">{error}</p> : null}
        {nextStop ? (
          <button type="button" onClick={() => open({ name: 'place', placeId: nextStop.place.id })}>
            Проверять: {innerPath(state, root.id, nextStop.place.id)}
          </button>
        ) : null}
        <div className="split-row">
          <button type="button" className="secondary" onClick={() => open({ name: 'scan' })}>
            Сканировать QR места
          </button>
          <button type="button" className={nextStop ? 'secondary' : undefined} onClick={() => open({ name: 'report' })}>
            Итог
          </button>
        </div>
      </div>

      <div className="panel stack">
        <strong>Места по порядку</strong>
        <div className="list">
          {route.map((stop) => {
            const items = itemsToCheck(state, session, stop.place.id)
            const marked = items.filter((item) => session.marks[item.id]).length
            const done = session.checked.includes(stop.place.id)
            return (
              <button
                key={stop.place.id}
                type="button"
                className={`list-item inventory-stop${done ? ' is-done' : ''}`}
                style={{ paddingLeft: 12 + Math.min(stop.depth, 6) * 14 }}
                onClick={() => open({ name: 'place', placeId: stop.place.id })}
              >
                <span className="stack-tight">
                  <strong>{stop.place.name}</strong>
                  <span className="muted">{items.length ? `вещей: ${items.length}` : 'вещей нет'}</span>
                </span>
                <span className={`badge${done ? '' : marked ? ' warn' : ''}`}>
                  {done ? '✓ проверено' : items.length ? `${marked} из ${items.length}` : '—'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        className="ghost"
        onClick={() => {
          if (window.confirm('Прервать инвентаризацию? Все отметки будут сброшены, вещи не изменятся.')) {
            saveInventory(null)
          }
        }}
      >
        Прервать инвентаризацию
      </button>
    </div>
  )
}

function InventoryStart({
  state,
  root,
  session,
  result,
}: {
  state: KeepItState
  root: Place
  session: InventorySession | null
  result: string | null
}) {
  const other = session ? state.findPlace(session.rootId) : undefined
  const route = inventoryRoute(root.id, state.places)
  const itemCount = route.reduce((sum, stop) => sum + checkableItems(stop.place.id, state.items).length, 0)

  function begin() {
    if (
      other &&
      !window.confirm(`Не завершена инвентаризация «${other.name}». Начать новую? Прежние отметки будут сброшены.`)
    ) {
      return
    }
    startInventory(root.id)
  }

  return (
    <div className="stack">
      {result ? (
        <div className="panel stack">
          <strong>Инвентаризация завершена</strong>
          <p className="muted">{result}</p>
          <button type="button" onClick={() => state.navigate({ name: 'place', placeId: root.id })}>
            Открыть «{root.name}»
          </button>
        </div>
      ) : null}

      <div className="panel stack">
        <strong>Инвентаризация «{root.name}»</strong>
        <p className="muted">
          Проверяется само место и всё внутри: мест — {route.length}, вещей — {itemCount}. Места идут по порядку
          вложенности; открывайте их из списка или по QR-метке. У каждой вещи отметьте: на месте, другое количество
          или нет. Вещи, которых нет в списке, добавляются кнопкой «Нашлась вещь». Изменения запишутся только после
          «Применить» в итоге.
        </p>
        {root.inventoriedAt ? (
          <span className="muted">Прошлая проверка: {formatLentDate(root.inventoriedAt)}</span>
        ) : null}
        {other ? (
          <button
            type="button"
            className="place-banner"
            onClick={() => state.navigate({ name: 'inventory', placeId: other.id })}
          >
            <strong>Не завершена проверка «{other.name}»</strong>
            <span className="muted"> — нажмите, чтобы продолжить</span>
          </button>
        ) : null}
        <button type="button" onClick={begin}>
          Начать инвентаризацию
        </button>
      </div>
    </div>
  )
}

function PlaceCheck({
  state,
  session,
  root,
  stop,
  index,
  total,
  onBack,
  onChecked,
}: {
  state: KeepItState
  session: InventorySession
  root: Place
  stop: RouteStop
  index: number
  total: number
  onBack: () => void
  onChecked: () => void
}) {
  const place = stop.place
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const items = itemsToCheck(state, session, place.id)
  const lent = state.itemsInPlace(place.id).filter(isItemLent)
  const found = session.found.filter((entry) => entry.placeId === place.id)
  const unmarked = items.filter((item) => !session.marks[item.id])
  const q = normalizeSearch(query)
  const shown = q ? items.filter((item) => normalizeSearch(item.name).includes(q)) : items

  function mark(itemId: string, value: InventoryMark | null) {
    updateInventory((current) => {
      const marks = { ...current.marks }
      if (value) marks[itemId] = value
      else delete marks[itemId]
      return { ...current, marks }
    })
  }

  function markRest(status: 'ok' | 'missing') {
    updateInventory((current) => {
      const marks = { ...current.marks }
      for (const item of unmarked) marks[item.id] = { status }
      return { ...current, marks }
    })
  }

  function finishPlace() {
    updateInventory((current) =>
      current.checked.includes(place.id) ? current : { ...current, checked: [...current.checked, place.id] },
    )
    onChecked()
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <button type="button" className="ghost crumb" onClick={onBack}>
          ← Все места ({index + 1} из {total})
        </button>
        <div>
          <strong style={{ fontSize: '1.15em' }}>{place.name}</strong>
          <div className="place-code">{innerPath(state, root.id, place.id)}</div>
        </div>
        {session.checked.includes(place.id) ? <span className="badge">✓ Место уже проверено</span> : null}
        {items.length > 6 ? (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти вещь по названию"
            aria-label="Найти вещь в этом месте по названию"
          />
        ) : null}
      </div>

      <div className="panel stack">
        <strong>
          Записано здесь: {items.length}
          {items.length ? ` · отмечено ${items.length - unmarked.length}` : ''}
        </strong>
        {items.length === 0 ? <span className="muted">По учёту здесь вещей нет.</span> : null}
        <div className="list">
          {shown.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              expected={expectedQuantity(session, item)}
              mark={session.marks[item.id]}
              onMark={(value) => mark(item.id, value)}
            />
          ))}
        </div>
        {q && shown.length === 0 ? <span className="muted">В этом месте такой вещи нет по учёту.</span> : null}
        {unmarked.length > 0 ? (
          <div className="split-row">
            <button type="button" className="secondary" onClick={() => markRest('ok')}>
              Остальные на месте ({unmarked.length})
            </button>
            <button type="button" className="secondary" onClick={() => markRest('missing')}>
              Остальных нет ({unmarked.length})
            </button>
          </div>
        ) : null}
        {lent.length > 0 ? (
          <span className="muted">
            Не проверяются — переданы на время: {lent.map((item) => `${item.name} (у ${item.lentTo})`).join(', ')}
          </span>
        ) : null}
      </div>

      <div className="panel stack">
        <strong>Нашлось здесь, но не записано</strong>
        {found.length > 0 ? (
          <div className="list">
            {found.map((entry) => (
              <FoundRow key={entry.id} state={state} entry={entry} />
            ))}
          </div>
        ) : null}
        {adding ? (
          <FoundForm
            state={state}
            session={session}
            place={place}
            hereItems={items}
            onEditQuantity={(item) => {
              mark(item.id, { status: 'qty', quantity: expectedQuantity(session, item) })
              setQuery(item.name)
              setAdding(false)
            }}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="secondary" onClick={() => setAdding(true)}>
            + Нашлась вещь
          </button>
        )}
      </div>

      <div className="stack sticky-actions panel">
        {unmarked.length > 0 ? <p className="muted">Отметьте все вещи, чтобы завершить место.</p> : null}
        <button type="button" disabled={unmarked.length > 0} onClick={finishPlace}>
          Место проверено → следующее
        </button>
      </div>
    </div>
  )
}

function ItemRow({
  item,
  expected,
  mark,
  onMark,
}: {
  item: Item
  /** Сколько должно быть здесь: записанное минус нашедшееся в других местах */
  expected: number
  mark: InventoryMark | undefined
  onMark: (value: InventoryMark | null) => void
}) {
  const status = mark?.status
  const integer = needsInteger(item)
  const [raw, setRaw] = useState(() => String(mark?.status === 'qty' ? mark.quantity : expected))
  const elsewhere = item.quantity - expected

  return (
    <div className={`list-item inventory-row inventory-check${status ? ` is-${status}` : ''}`}>
      <span className="stack-tight">
        <strong>{item.name}</strong>
        <span className="muted">
          по учёту: {item.needsFill ? 'заготовка' : formatQty(item.quantity, item.unit)}
          {elsewhere > 0
            ? ` · ${formatQty(elsewhere, item.unit)} нашлось в другом месте, здесь должно быть ${formatQty(expected, item.unit)}`
            : ''}
        </span>
      </span>
      <div className="inventory-actions">
        <button
          type="button"
          className={status === 'ok' ? undefined : 'secondary'}
          aria-pressed={status === 'ok'}
          aria-label="На месте"
          onClick={() => onMark(status === 'ok' ? null : { status: 'ok' })}
        >
          ✓
        </button>
        <button
          type="button"
          className={status === 'qty' ? undefined : 'secondary'}
          aria-pressed={status === 'qty'}
          onClick={() => {
            setRaw(String(expected))
            onMark(status === 'qty' ? null : { status: 'qty', quantity: expected })
          }}
        >
          Кол-во
        </button>
        <button
          type="button"
          className={status === 'missing' ? 'danger' : 'secondary'}
          aria-pressed={status === 'missing'}
          aria-label="Нет на месте"
          onClick={() => onMark(status === 'missing' ? null : { status: 'missing' })}
        >
          ✗
        </button>
      </div>
      {status === 'qty' ? (
        <label className="field inventory-qty">
          Найдено, {UNIT_LABELS[item.unit]}
          <input
            type="number"
            inputMode={integer ? 'numeric' : 'decimal'}
            min={0}
            step={integer ? 1 : 'any'}
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value)
              const value = parseQuantity(event.target.value, integer)
              if (value !== null) onMark({ status: 'qty', quantity: value })
            }}
          />
          {parseQuantity(raw, integer) === null ? (
            <span className="error">{integer ? 'Целое число, 0 или больше' : 'Число, 0 или больше'}</span>
          ) : null}
        </label>
      ) : null}
    </div>
  )
}

function FoundRow({ state, entry }: { state: KeepItState; entry: FoundEntry }) {
  const item = entry.kind === 'move' ? state.findItem(entry.itemId) : undefined
  return (
    <div className="list-item inventory-row is-found">
      <span className="stack-tight">
        <strong>{entry.kind === 'move' ? (item?.name ?? 'Вещь') : entry.name}</strong>
        <span className="muted">
          {entry.kind === 'move'
            ? item
              ? `${formatQty(Math.min(entry.quantity ?? item.quantity, item.quantity), item.unit)} из ${formatQty(item.quantity, item.unit)} перенесётся сюда из: ${fullPath(state, item.placeId)}`
              : 'перенесётся сюда'
            : `новая · ${formatQty(entry.quantity, entry.unit)}`}
        </span>
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Убрать из найденного"
        onClick={() =>
          updateInventory((current) => ({ ...current, found: current.found.filter((other) => other.id !== entry.id) }))
        }
      >
        ×
      </button>
    </div>
  )
}

/** Вещь в руках, а в списке места её нет: ищем по названию по всему объекту или добавляем новую */
function FoundForm({
  state,
  session,
  place,
  hereItems,
  onEditQuantity,
  onClose,
}: {
  state: KeepItState
  session: InventorySession
  place: Place
  /** Вещи, записанные в этом месте: такую же не добавляем, а меняем ей количество */
  hereItems: Item[]
  onEditQuantity: (item: Item) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [rawQty, setRawQty] = useState('1')
  const [unitChoice, setUnitChoice] = useState<UnitCode | null>(null)
  const [picked, setPicked] = useState<Item | null>(null)
  const [rawPart, setRawPart] = useState('')
  const known = findName(state.itemNames, name)
  const mode: AccountingMode = known?.mode ?? 'durable'
  const unit = unitChoice ?? known?.unit ?? 'pcs'
  const quantity = parseQuantity(rawQty, needsInteger({ mode, unit }))
  const q = normalizeSearch(name)
  const hereNames = new Set(hereItems.map((item) => normalizeSearch(item.name)))
  const alreadyHere = q.length >= 2 ? hereItems.filter((item) => normalizeSearch(item.name).includes(q)) : []
  const exactHere = hereNames.has(q)
  const matches =
    q.length >= 2
      ? state.items
          .filter(
            (item) =>
              item.placeId !== place.id &&
              !hereNames.has(normalizeSearch(item.name)) &&
              !isFullyMoved(session, item) &&
              !isItemLent(item) &&
              normalizeSearch(item.name).includes(q),
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
          .slice(0, 8)
      : []

  const available = picked ? expectedQuantity(session, picked) : 0
  const part = picked ? parseQuantity(rawPart, needsInteger(picked)) : null
  const partValid = part !== null && part > 0 && part <= available

  function pick(item: Item) {
    const rest = expectedQuantity(session, item)
    if (rest <= 1) {
      moveHere(item, rest)
      return
    }
    setPicked(item)
    setRawPart(String(rest))
  }

  function moveHere(item: Item, count: number) {
    const whole = count + movedQuantity(session, item) >= item.quantity
    updateInventory((current) =>
      addFound(current, {
        kind: 'move',
        placeId: place.id,
        itemId: item.id,
        quantity: whole ? undefined : count,
      }),
    )
    onClose()
  }

  if (picked) {
    return (
      <div className="stack">
        <strong>{picked.name}</strong>
        <span className="muted">
          Записано: {fullPath(state, picked.placeId)} · {formatQty(available, picked.unit)}
        </span>
        <label className="field">
          Сколько нашлось здесь, {UNIT_LABELS[picked.unit]}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={available}
            value={rawPart}
            onChange={(event) => setRawPart(event.target.value)}
            autoFocus
          />
          {!partValid ? (
            <span className="error">От 1 до {formatQty(available, picked.unit)}</span>
          ) : part! < available ? (
            <span className="muted">
              Остаток {formatQty(available - part!, picked.unit)} останется в записи на старом месте — его проверите
              там.
            </span>
          ) : null}
        </label>
        <button type="button" disabled={!partValid} onClick={() => moveHere(picked, part!)}>
          Перенести сюда
        </button>
        <button type="button" className="ghost" onClick={() => setPicked(null)}>
          ← Другая вещь
        </button>
      </div>
    )
  }

  function addNew() {
    if (!name.trim() || quantity === null) return
    updateInventory((current) =>
      addFound(current, { kind: 'new', placeId: place.id, name: name.trim(), quantity, unit, mode }),
    )
    onClose()
  }

  return (
    <div className="stack">
      <label className="field">
        Название
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например, изолента"
          autoFocus
        />
      </label>

      {alreadyHere.length > 0 ? (
        <div className="stack">
          <span className="muted">Уже есть в списке этого места — укажите найденное количество:</span>
          <div className="list">
            {alreadyHere.map((item) => (
              <button key={item.id} type="button" className="place-banner" onClick={() => onEditQuantity(item)}>
                <strong>{item.name}</strong>
                <span className="muted">
                  {' '}
                  — по учёту {formatQty(expectedQuantity(session, item), item.unit)}, нажмите, чтобы изменить
                  количество
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="stack">
          <span className="muted">Записана в другом месте? Нажмите, чтобы перенести сюда:</span>
          <div className="list">
            {matches.map((item) => (
              <button key={item.id} type="button" className="list-item" onClick={() => pick(item)}>
                <span className="stack-tight">
                  <strong>{item.name}</strong>
                  <span className="muted">{fullPath(state, item.placeId)}</span>
                </span>
                <span className="badge">{formatQty(expectedQuantity(session, item), item.unit)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : q.length >= 2 && alreadyHere.length === 0 ? (
        <span className="muted">В других местах такой вещи нет — добавьте её как новую.</span>
      ) : null}

      {name.trim() && !exactHere ? (
        <>
          <div className="split-row">
            <label className="field">
              Количество
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={rawQty}
                onChange={(event) => setRawQty(event.target.value)}
              />
            </label>
            <label className="field">
              Единица
              <ChoiceSelect title="Единица" value={unit} options={unitOptionsFor(mode)} onChange={setUnitChoice} />
            </label>
          </div>
          <button type="button" disabled={quantity === null} onClick={addNew}>
            Добавить «{name.trim()}» как новую вещь
          </button>
          <span className="muted">Категорию можно будет назначить потом в разделе «Без категории».</span>
        </>
      ) : null}

      <button type="button" className="ghost" onClick={onClose}>
        Отмена
      </button>
    </div>
  )
}

function InventoryReport({
  state,
  session,
  root,
  route,
  onBack,
  onApplied,
}: {
  state: KeepItState
  session: InventorySession
  root: Place
  route: RouteStop[]
  onBack: () => void
  onApplied: (text: string) => void
}) {
  const [removeMissing, setRemoveMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const summary = summarizeInventory(session, route, state.items)
  const unchecked = route.filter((stop) => !session.checked.includes(stop.place.id))
  const checkedIds = route.filter((stop) => session.checked.includes(stop.place.id)).map((stop) => stop.place.id)
  const where = (placeId: string) => innerPath(state, root.id, placeId)

  async function apply() {
    setBusy(true)
    setError(null)
    try {
      await state.finishInventory({
        changed: summary.changed.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
        removeIds: removeMissing ? summary.missing.map((item) => item.id) : [],
        moves: summary.moved.map(({ entry, quantity }) => ({ itemId: entry.itemId, placeId: entry.placeId, quantity })),
        added: summary.added.map((entry) => ({
          placeId: entry.placeId,
          name: entry.name,
          quantity: entry.quantity,
          unit: entry.unit,
          mode: entry.mode,
        })),
        checkedPlaceIds: checkedIds,
        date: todayIso(),
      })
      saveInventory(null)
      const parts = [
        `на месте: ${summary.ok.length}`,
        summary.changed.length ? `исправлено количество: ${summary.changed.length}` : '',
        summary.missing.length
          ? removeMissing
            ? `удалено ненайденных: ${summary.missing.length}`
            : `не найдено (оставлены в учёте): ${summary.missing.length}`
          : '',
        summary.moved.length ? `перенесено: ${summary.moved.length}` : '',
        summary.added.length ? `добавлено новых: ${summary.added.length} (назначьте категорию)` : '',
        `проверено мест: ${checkedIds.length} из ${route.length}`,
      ].filter(Boolean)
      onApplied(`${parts.join(', ')}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось записать итог')
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <button type="button" className="ghost crumb" onClick={onBack}>
          ← Все места
        </button>
        <strong>Итог инвентаризации «{root.name}»</strong>
        <span className="muted">
          Проверено мест: {summary.checkedPlaces} из {summary.totalPlaces}. На месте: {summary.ok.length}, другое
          количество: {summary.changed.length}, не найдено: {summary.missing.length}, нашлось: {' '}
          {summary.moved.length + summary.added.length}.
        </span>
        {unchecked.length > 0 ? (
          <div className="place-banner">
            <strong>Не проверены места: {unchecked.length}</strong>
            <span className="muted">
              {' '}
              — {unchecked
                .slice(0, 5)
                .map((stop) => stop.place.name)
                .join(', ')}
              {unchecked.length > 5 ? ' и другие' : ''}. Дата проверки запишется только у проверенных мест.
            </span>
          </div>
        ) : null}
      </div>

      {summary.missing.length > 0 ? (
        <div className="panel stack">
          <strong>Не найдено: {summary.missing.length}</strong>
          <div className="list">
            {summary.missing.map((item) => (
              <div key={item.id} className="list-item inventory-row is-missing">
                <span className="stack-tight">
                  <strong>{item.name}</strong>
                  <span className="muted">{where(item.placeId)}</span>
                </span>
                <span className="badge">{formatQty(item.quantity, item.unit)}</span>
              </div>
            ))}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={removeMissing} onChange={(event) => setRemoveMissing(event.target.checked)} />
            <span className="stack-tight">
              <strong>Удалить ненайденные из учёта</strong>
              <span className="muted">Иначе они останутся в своих местах как есть</span>
            </span>
          </label>
        </div>
      ) : null}

      {summary.changed.length > 0 ? (
        <div className="panel stack">
          <strong>Другое количество: {summary.changed.length}</strong>
          <div className="list">
            {summary.changed.map(({ item, expected, quantity }) => (
              <div key={item.id} className="list-item inventory-row is-qty">
                <span className="stack-tight">
                  <strong>{item.name}</strong>
                  <span className="muted">{where(item.placeId)}</span>
                </span>
                <span className="badge warn">
                  {formatQty(expected, item.unit)} → {formatQty(quantity, item.unit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {summary.moved.length + summary.added.length > 0 ? (
        <div className="panel stack">
          <strong>Нашлось: {summary.moved.length + summary.added.length}</strong>
          <div className="list">
            {summary.moved.map(({ entry, item, quantity }) => (
              <div key={entry.id} className="list-item inventory-row is-found">
                <span className="stack-tight">
                  <strong>{item.name}</strong>
                  <span className="muted">
                    из «{fullPath(state, item.placeId)}» → {where(entry.placeId)}
                    {quantity < item.quantity ? ` (часть, из ${formatQty(item.quantity, item.unit)})` : ''}
                  </span>
                </span>
                <span className="badge">{formatQty(quantity, item.unit)}</span>
              </div>
            ))}
            {summary.added.map((entry) => (
              <div key={entry.id} className="list-item inventory-row is-found">
                <span className="stack-tight">
                  <strong>{entry.name}</strong>
                  <span className="muted">новая · {where(entry.placeId)}</span>
                </span>
                <span className="badge">{formatQty(entry.quantity, entry.unit)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="stack sticky-actions panel">
        {error ? <p className="error">{error}</p> : null}
        <button type="button" disabled={busy} onClick={() => void apply()}>
          {busy ? 'Записываю…' : 'Применить и завершить'}
        </button>
      </div>
    </div>
  )
}
