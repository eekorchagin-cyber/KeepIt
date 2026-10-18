import { useState } from 'react'
import { CategoryPicker } from '../components/CategoryPicker'
import type { KeepItState } from '../hooks/useKeepIt'
import { findName } from '../data/itemNames'
import { normalizeSearch } from '../data/repository'
import { unitForMode, unitOptionsFor } from '../data/units'
import type { AccountingMode, UnitCode } from '../types'

export function AddItemScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
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
      await state.createItem({
        placeId,
        name,
        mode,
        category,
        subcategory,
        unit: unitForMode(mode, unit),
        quantity: qty,
        note,
      })
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

  return (
    <div className="stack">
      <div className="panel stack">
        <p className="muted">Место: {place.name}</p>

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
                // Не уводим фокус из поля до нажатия, иначе подсказка исчезнет раньше выбора
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  onNameChange(entry.name)
                  setTypingName(false)
                }}
              >
                <span>{entry.name}</span>
                {entry.category ? (
                  <span className="muted">
                    {entry.subcategory ? `${entry.category} / ${entry.subcategory}` : entry.category}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <label className="field">
          Режим учёта
          <select
            value={mode}
            onChange={(e) => {
              const next = e.target.value as AccountingMode
              setMode(next)
              setUnit((current) => unitForMode(next, current))
              setQuantity(next === 'durable' ? '1' : '0')
            }}
          >
            <option value="durable">Постоянное хранение</option>
            <option value="consumable">Расходный материал</option>
          </select>
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
            <select value={unit} onChange={(e) => setUnit(e.target.value as UnitCode)}>
              {unitOptionsFor(mode).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
    </div>
  )
}
