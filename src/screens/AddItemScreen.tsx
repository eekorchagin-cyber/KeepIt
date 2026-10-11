import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { UNIT_OPTIONS } from '../data/units'
import type { AccountingMode, UnitCode } from '../types'

export function AddItemScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<AccountingMode>('durable')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState<UnitCode>('pcs')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!place) {
    return (
      <div className="panel">
        <p>Место не найдено</p>
      </div>
    )
  }

  async function save(andAnother: boolean) {
    setBusy(true)
    setError(null)
    try {
      const qty = Number(quantity.replace(',', '.'))
      if (!name.trim()) throw new Error('Укажите название')
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
        unit: mode === 'durable' ? 'pcs' : unit,
        quantity: qty,
        note,
      })
      if (andAnother) {
        setName('')
        setNote('')
        setQuantity(mode === 'durable' ? '1' : '0')
      } else {
        state.navigate({ name: 'place', placeId })
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
        <strong>Новая вещь</strong>
        <p className="muted">Место: {place.name}</p>

        <label className="field">
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Дрель" />
        </label>

        <label className="field">
          Режим учёта
          <select
            value={mode}
            onChange={(e) => {
              const next = e.target.value as AccountingMode
              setMode(next)
              setQuantity(next === 'durable' ? '1' : '0')
            }}
          >
            <option value="durable">Постоянное хранение</option>
            <option value="consumable">Расходный материал</option>
          </select>
        </label>

        <label className="field">
          Категория
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Инструменты" />
        </label>

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
          {mode === 'consumable' ? (
            <label className="field" style={{ width: 110 }}>
              Ед.
              <select value={unit} onChange={(e) => setUnit(e.target.value as UnitCode)}>
                {UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field" style={{ width: 110 }}>
              Ед.
              <input value="шт" disabled />
            </label>
          )}
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
