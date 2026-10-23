import { useState } from 'react'
import { CategoryPicker } from '../components/CategoryPicker'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { MODE_OPTIONS } from '../data/modes'
import type { KeepItState } from '../hooks/useKeepIt'
import { findName } from '../data/itemNames'
import { normalizeSearch } from '../data/repository'
import { unitForMode, unitOptionsFor } from '../data/units'
import { ChoosePlaceSheet } from '../components/MoveItemSheet'
import { PlaceTypeIcon } from '../components/PlaceTypeIcon'
import { PLACE_TYPES, canNest } from '../data/placeTypes'
import type { AccountingMode, PlaceType, UnitCode } from '../types'

/** После выбора подсказки список исчезает — «click» того же касания не должен попасть в поле под пальцем */
function swallowNextClick() {
  const stop = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    document.removeEventListener('click', stop, true)
  }
  document.addEventListener('click', stop, true)
  window.setTimeout(() => document.removeEventListener('click', stop, true), 600)
}

export function AddItemScreen({ state, placeId, code }: { state: KeepItState; placeId: string; code?: string }) {
  const [targetPlaceId, setTargetPlaceId] = useState(placeId)
  const place = state.findPlace(targetPlaceId)
  /** Незнакомый отсканированный код: присваивается первой сохранённой вещи или новому месту */
  const [pendingCode, setPendingCode] = useState(code ?? null)
  const [kind, setKind] = useState<'item' | 'place'>('item')
  const [choosingPlace, setChoosingPlace] = useState(false)
  const placeTypes = place ? PLACE_TYPES.filter((option) => canNest(place.type, option.value)) : []
  const [placeType, setPlaceType] = useState<PlaceType>('box')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<AccountingMode>('durable')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [unit, setUnit] = useState<UnitCode>('pcs')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Подсказки видны, только пока набирают название: после ввода — да, после ухода из поля или выбора — нет */
  const [typingName, setTypingName] = useState(false)

  if (!place) {
    return (
      <div className="panel">
        <p>Место не найдено</p>
      </div>
    )
  }

  // Подсказки из каталога — только когда начали вводить; сначала названия, которые начинаются с введённого
  const query = normalizeSearch(name)
  const suggestions =
    typingName && query && !findName(state.itemNames, name)
      ? state.itemNames
          .filter((entry) => {
            const key = normalizeSearch(entry.name)
            return key.includes(query) && key !== query
          })
          .sort(
            (a, b) =>
              Number(!normalizeSearch(a.name).startsWith(query)) - Number(!normalizeSearch(b.name).startsWith(query)) ||
              a.name.localeCompare(b.name, 'ru'),
          )
          .slice(0, 6)
      : []

  /** Где ещё лежат вещи с таким названием — только для сведения, место новой вещи не меняется */
  function whereStored(entryName: string): string {
    const key = normalizeSearch(entryName)
    const places = [
      ...new Set(state.items.filter((item) => normalizeSearch(item.name) === key).map((item) => item.placeId)),
    ]
      .map((id) => state.findPlace(id)?.name)
      .filter((placeName): placeName is string => Boolean(placeName))
    if (places.length === 0) return ''
    return places.length > 2 ? `${places.slice(0, 2).join(', ')} и ещё ${places.length - 2}` : places.join(', ')
  }

  function pickSuggestion(value: string) {
    if (!typingName) return
    onNameChange(value)
    setTypingName(false)
  }

  function onNameChange(value: string) {
    setName(value)
    const known = findName(state.itemNames, value)
    if (!known?.category || category.trim()) return
    setCategory(known.category)
    setSubcategory(known.subcategory)
    setMode(known.mode)
    setUnit(unitForMode(known.mode, known.unit))
    setQuantity(known.mode === 'durable' ? '1' : '0')
  }

  async function save(andAnother: boolean) {
    setBusy(true)
    setError(null)
    try {
      const qty = Number(quantity.replace(',', '.'))
      if (!name.trim()) throw new Error('Укажите название')
      if (!category.trim()) throw new Error('Выберите категорию из справочника')
      if (quantity.trim() === '') throw new Error('Укажите количество')
      if (Number.isNaN(qty) || qty < 0) throw new Error('Некорректное количество')
      if (mode === 'durable' && (!Number.isInteger(qty) || qty < 1)) {
        throw new Error('Для постоянного хранения укажите целое число от 1')
      }
      const item = await state.createItem({
        placeId: targetPlaceId,
        name,
        mode,
        category,
        subcategory,
        unit: unitForMode(mode, unit),
        quantity: qty,
        note,
      })
      if (pendingCode) {
        await state.assignCode(pendingCode, { kind: 'item', id: item.id })
        setPendingCode(null)
      }
      if (andAnother) {
        setName('')
        setNote('')
        setQuantity(mode === 'durable' ? '1' : '0')
      } else {
        // Назад к месту, откуда открыли «+», — экран ввода не остаётся в истории «←»
        state.goBack()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  /** Новое место хранения (коробка, полка…) с отсканированным кодом — внутри выбранного места */
  async function savePlace() {
    if (!place || !pendingCode) return
    setBusy(true)
    setError(null)
    try {
      if (!name.trim()) throw new Error('Укажите название')
      const type = placeTypes.some((option) => option.value === placeType) ? placeType : placeTypes[0]?.value
      if (!type) throw new Error(`В «${place.name}» нельзя создать место — выберите другое`)
      const created = await state.createChildPlace(place.id, name.trim(), type)
      await state.assignCode(pendingCode, { kind: 'place', id: created.id })
      state.replaceScreen({ name: 'place', placeId: created.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const placePath = state
    .pathFor(place.id)
    .map((part) => part.name)
    .join(' / ')
  const shownCode = pendingCode && pendingCode.length > 80 ? `${pendingCode.slice(0, 80)}…` : pendingCode

  return (
    <div className="stack">
      {pendingCode ? (
        <div className="panel stack-tight">
          <span className="muted">Отсканирован новый код</span>
          <strong className="assign-code-value">{shownCode}</strong>
          <span className="muted">
            Он будет присвоен {kind === 'item' ? 'новой вещи' : 'новому месту хранения'} — потом его скан откроет{' '}
            {kind === 'item' ? 'её карточку' : 'это место'}.
          </span>
          <div className="split-row">
            <button type="button" className={kind === 'item' ? undefined : 'secondary'} onClick={() => setKind('item')}>
              Вещь
            </button>
            <button
              type="button"
              className={kind === 'place' ? undefined : 'secondary'}
              onClick={() => setKind('place')}
            >
              Место хранения
            </button>
          </div>
          <button
            type="button"
            className="ghost assigned-codes-toggle"
            onClick={() => state.replaceScreen({ name: 'assign-code', code: pendingCode })}
          >
            Это уже есть в KeepIt — присвоить код существующей вещи или месту
          </button>
        </div>
      ) : null}

      {choosingPlace ? (
        <ChoosePlaceSheet
          state={state}
          title={kind === 'item' ? 'Где лежит новая вещь' : 'Где будет новое место'}
          subjectLabel={name.trim() ? `«${name.trim()}»` : kind === 'item' ? 'Новая вещь' : 'Новое место'}
          currentPlaceId={targetPlaceId}
          onChoose={setTargetPlaceId}
          onClose={() => setChoosingPlace(false)}
        />
      ) : null}

      {kind === 'place' && pendingCode ? (
        <div className="panel stack">
          <div className="row">
            <p className="muted grow">Внутри: {placePath}</p>
            <button type="button" className="ghost" onClick={() => setChoosingPlace(true)}>
              Изменить
            </button>
          </div>
          <label className="field">
            Название
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Коробка с инструментом" />
          </label>
          <label className="field">
            Тип места
            <ChoiceSelect<PlaceType>
              title="Тип места"
              value={
                placeTypes.some((option) => option.value === placeType) ? placeType : (placeTypes[0]?.value ?? 'box')
              }
              options={placeTypes.map((option) => ({
                ...option,
                icon: <PlaceTypeIcon type={option.value} decorative />,
              }))}
              onChange={setPlaceType}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="button" disabled={busy} onClick={() => void savePlace()}>
            Сохранить место
          </button>
        </div>
      ) : (
        <div className="panel stack">
          <div className="row">
            <p className="muted grow">Место: {placePath}</p>
            <button type="button" className="ghost" onClick={() => setChoosingPlace(true)}>
              Изменить
            </button>
          </div>

          <label className="field">
            Название
            <input
              className="name-input"
              value={name}
              onChange={(e) => {
                setTypingName(true)
                onNameChange(e.target.value)
              }}
              onBlur={() => setTypingName(false)}
              placeholder="Дрель"
              autoComplete="off"
            />
          </label>
          {suggestions.length > 0 ? (
            <div className="name-suggest" role="listbox" aria-label="Названия из каталога">
              {suggestions.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="name-suggest-row"
                  role="option"
                  aria-selected={false}
                  // Выбор — в момент касания: на iPhone поле теряет фокус раньше «click», и список исчезает до выбора
                  onPointerDown={(e) => {
                    e.preventDefault()
                    swallowNextClick()
                    pickSuggestion(entry.name)
                  }}
                  onClick={() => pickSuggestion(entry.name)}
                >
                  <span className="name-suggest-name">{entry.name}</span>
                  {entry.category ? (
                    <span className="muted">
                      Категория: {entry.subcategory ? `${entry.category} / ${entry.subcategory}` : entry.category}
                    </span>
                  ) : null}
                  {whereStored(entry.name) ? <span className="muted">Уже есть: {whereStored(entry.name)}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          <label className="field">
            Режим учёта
            <ChoiceSelect
              title="Режим учёта"
              value={mode}
              options={MODE_OPTIONS}
              onChange={(next) => {
                setMode(next)
                setUnit((current) => unitForMode(next, current))
                setQuantity(next === 'durable' ? '1' : '0')
              }}
            />
          </label>

          <CategoryPicker
            tree={state.categories}
            category={category}
            subcategory={subcategory}
            onChange={({ category: nextCategory, subcategory: nextSub }) => {
              setCategory(nextCategory)
              setSubcategory(nextSub)
            }}
          />

          <div className="row">
            <label className="field grow">
              Количество
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode={mode === 'durable' ? 'numeric' : 'decimal'}
                placeholder={mode === 'durable' ? '2' : '0'}
              />
            </label>
            <label className="field" style={{ width: 110 }}>
              Ед.
              <ChoiceSelect title="Единица" value={unit} options={unitOptionsFor(mode)} onChange={setUnit} />
            </label>
          </div>

          <label className="field">
            Примечание
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <div className="row wrap">
            <button type="button" disabled={busy} onClick={() => void save(false)}>
              Сохранить
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void save(true)}>
              Сохранить и ещё
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
