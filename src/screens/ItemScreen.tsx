import { useState } from 'react'
import { CategorySheet } from '../components/CategoryPicker'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { ModeCategory } from '../components/ModeCategory'
import { ServicePanel } from '../components/ServicePanel'
import { MoveItemSheet } from '../components/MoveItemSheet'
import { formatLentDate, isItemLent } from '../data/repository'
import type { KeepItState } from '../hooks/useKeepIt'
import { formatQty } from '../data/units'
import { PLACE_TYPES } from '../data/placeTypes'
import type { PlaceType } from '../types'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ItemScreen({ state, itemId }: { state: KeepItState; itemId: string }) {
  const item = state.findItem(itemId)
  const place = item ? state.findPlace(item.placeId) : undefined
  const [amount, setAmount] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [lendOpen, setLendOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [placeOpen, setPlaceOpen] = useState(false)
  const [placeName, setPlaceName] = useState('')
  const [placeType, setPlaceType] = useState<PlaceType>('box')
  const [lentTo, setLentTo] = useState('')
  const [lentAt, setLentAt] = useState(todayLocal())

  if (!item) {
    return (
      <div className="panel stack">
        <p>Карточка не найдена в активном объекте.</p>
        <button type="button" onClick={() => state.jump({ name: 'home' })}>
          На главную
        </button>
      </div>
    )
  }

  const lent = isItemLent(item)

  async function apply(kind: 'in' | 'out') {
    if (!item) return
    const current = item
    setBusy(true)
    setError(null)
    try {
      const delta = Number(amount.replace(',', '.'))
      if (Number.isNaN(delta) || delta <= 0) throw new Error('Укажите положительное количество')
      if (current.mode === 'durable' && !Number.isInteger(delta)) {
        throw new Error('Для штук укажите целое число')
      }
      const next = kind === 'in' ? current.quantity + delta : current.quantity - delta
      if (next < 0) throw new Error('Количество не может быть отрицательным')
      if (current.mode === 'durable' && next < 1 && kind === 'out') {
        throw new Error('Количество постоянного хранения не может быть меньше 1')
      }
      await state.changeQuantity(current.id, next, kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function submitLend() {
    if (!item) return
    setBusy(true)
    setError(null)
    try {
      await state.lendOutItem(item.id, lentTo, lentAt)
      setLendOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function submitToPlace() {
    if (!item) return
    setBusy(true)
    setError(null)
    try {
      const created = await state.itemToPlace(item.id, { name: placeName, type: placeType })
      setPlaceOpen(false)
      state.jump({ name: 'place', placeId: created.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(false)
    }
  }

  async function submitCategory(category: string, subcategory: string) {
    if (!item) return
    setCategoryOpen(false)
    setBusy(true)
    setError(null)
    try {
      await state.assignCategories([item.id], category, subcategory)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function submitDelete() {
    if (!item) return
    if (!window.confirm(`Удалить «${item.name}»? Вещь и история её движений будут удалены.`)) return
    const placeId = item.placeId
    setBusy(true)
    setError(null)
    try {
      await state.removeItems([item.id])
      state.leaveDeletedItem(item.id, placeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(false)
    }
  }

  async function submitReturn() {
    if (!item) return
    setBusy(true)
    setError(null)
    try {
      await state.returnFromLend(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const placePath =
    place?.code ||
    (place ? state.pathFor(place.id).map((part) => part.name).join(' / ') : '—')

  return (
    <div className="stack">
      <div className="panel card-meta">
        <strong className="card-meta-title">
          {item.name}: {formatQty(item.quantity, item.unit)}
        </strong>
        <div className="muted card-meta-line">
          <ModeCategory
            mode={item.mode}
            category={item.category}
            subcategory={item.subcategory}
            suffix={item.needsFill ? ' · требует заполнения' : ''}
          />
        </div>
        <div className="chip-row">
          <button
            type="button"
            className="suggest-chip neutral"
            disabled={busy}
            onClick={() => {
              setError(null)
              setCategoryOpen(true)
            }}
          >
            {item.category ? 'Изменить категорию' : 'Назначить категорию'}
          </button>
        </div>

        {lent ? (
          <div className="lent-banner">
            <strong>У {item.lentTo}</strong>
            {item.lentAt ? (
              <span className="muted"> с {formatLentDate(item.lentAt)}</span>
            ) : null}
            <div className="muted">Место возврата: {placePath}</div>
          </div>
        ) : (
          <div className="muted card-meta-line place-path-line">Место: {placePath}</div>
        )}

        {item.note ? <div className="card-meta-line">{item.note}</div> : null}
        {item.needsFill ? (
          <p className="muted card-meta-line">
            Заготовка из каталога: укажите фактические данные, затем позиция попадёт в остатки.
          </p>
        ) : null}
        <div className="row wrap card-meta-actions">
          {item.needsFill ? (
            <button
              type="button"
              onClick={() => state.navigate({ name: 'edit-item', itemId: item.id })}
            >
              Заполнить
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => state.navigate({ name: 'edit-item', itemId: item.id })}
            >
              Изменить
            </button>
          )}
          <button type="button" className="secondary" onClick={() => setMoveOpen(true)}>
            Перенести
          </button>
          {!lent ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setPlaceName(item.name)
                setPlaceType('box')
                setError(null)
                setPlaceOpen(true)
              }}
            >
              Сделать местом хранения
            </button>
          ) : null}
          <button type="button" className="secondary danger-text" disabled={busy} onClick={() => void submitDelete()}>
            Удалить
          </button>
          {!item.needsFill && !lent ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setLentTo('')
                setLentAt(todayLocal())
                setError(null)
                setLendOpen(true)
              }}
            >
              Передать
            </button>
          ) : null}
          {lent ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setLentTo(item.lentTo)
                  setLentAt(item.lentAt || todayLocal())
                  setError(null)
                  setLendOpen(true)
                }}
              >
                Изменить передачу
              </button>
              <button type="button" disabled={busy} onClick={() => void submitReturn()}>
                Вернуть
              </button>
            </>
          ) : null}
        </div>
      </div>

      <ServicePanel key={item.id} state={state} item={item} />

      {!item.needsFill ? (
        <div className="panel stack">
          <strong>{item.mode === 'durable' ? 'Изменить количество' : 'Расход / Приход'}</strong>
          {error && !lendOpen ? <p className="error">{error}</p> : null}
          <div className="qty-actions">
            <button
              type="button"
              className="qty-btn secondary"
              aria-label={item.mode === 'durable' ? 'Уменьшить' : 'Расход'}
              disabled={busy}
              onClick={() => void apply('out')}
            >
              −
            </button>
            <input
              className="qty-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode={item.mode === 'durable' ? 'numeric' : 'decimal'}
              aria-label="Количество"
            />
            <button
              type="button"
              className="qty-btn"
              aria-label={item.mode === 'durable' ? 'Увеличить' : 'Приход'}
              disabled={busy}
              onClick={() => void apply('in')}
            >
              +
            </button>
          </div>
        </div>
      ) : null}

      {lendOpen ? (
        <div className="sheet-backdrop" onClick={() => setLendOpen(false)} role="presentation">
          <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
            <div className="row">
              <strong className="grow">Передать на время</strong>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setLendOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="stack">
              <p className="muted">
                Вещь останется привязана к месту возврата «{placePath}». Отметьте, у кого искать.
              </p>
              <label className="field">
                Кому / у кого искать
                <input
                  value={lentTo}
                  onChange={(e) => setLentTo(e.target.value)}
                  placeholder="Например, Иван"
                  autoFocus
                />
              </label>
              <label className="field">
                Дата передачи
                <input type="date" value={lentAt} onChange={(e) => setLentAt(e.target.value)} />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <button type="button" disabled={busy || !lentTo.trim()} onClick={() => void submitLend()}>
                Отметить передачу
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setLendOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {moveOpen ? <MoveItemSheet state={state} itemId={item.id} onClose={() => setMoveOpen(false)} /> : null}

      {placeOpen ? (
        <div className="sheet-backdrop" onClick={() => setPlaceOpen(false)} role="presentation">
          <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
            <div className="row">
              <strong className="grow">Сделать местом хранения</strong>
              <button type="button" className="icon-btn" onClick={() => setPlaceOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="stack">
              <p className="muted">
                Вместо вещи «{item.name}» в «{place?.name ?? 'месте'}» появится место хранения — в него можно
                класть вещи и печатать для него метку. Сама вещь будет удалена из учёта.
                {item.quantity > 1 ? ` Было ${formatQty(item.quantity, item.unit)} — создаётся одно место.` : ''}
              </p>
              <label className="field">
                Название места
                <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} autoFocus />
              </label>
              <label className="field">
                Тип
                <ChoiceSelect title="Тип места" value={placeType} options={PLACE_TYPES} onChange={setPlaceType} />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <button type="button" disabled={busy || !placeName.trim()} onClick={() => void submitToPlace()}>
                Сделать местом
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setPlaceOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryOpen ? (
        <CategorySheet
          tree={state.categories}
          title={`Категория для «${item.name}»`}
          initialCategory={item.category}
          onClose={() => setCategoryOpen(false)}
          onPick={({ category, subcategory }) => void submitCategory(category, subcategory)}
        />
      ) : null}
    </div>
  )
}
