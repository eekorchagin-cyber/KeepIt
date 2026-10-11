import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { UNIT_OPTIONS } from '../data/units'
import type { AccountingMode, UnitCode } from '../types'

export function EditItemScreen({ state, itemId }: { state: KeepItState; itemId: string }) {
  const item = state.findItem(itemId)
  const place = item ? state.findPlace(item.placeId) : undefined

  const [name, setName] = useState(item?.name ?? '')
  const [mode, setMode] = useState<AccountingMode>(item?.mode ?? 'durable')
  const [category, setCategory] = useState(item?.category ?? '')
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? '')
  const [unit, setUnit] = useState<UnitCode>(item?.unit ?? 'pcs')
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : '1')
  const [note, setNote] = useState(
    item?.note === 'Требует заполнения' ? '' : (item?.note ?? ''),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!item) {
    return (
      <div className="panel stack">
        <p>Карточка не найдена.</p>
        <button type="button" onClick={() => state.jump({ name: 'home' })}>
          На главную
        </button>
      </div>
    )
  }

  const placePath =
    place?.code ||
    (place ? state.pathFor(place.id).map((part) => part.name).join(' / ') : '—')
  const filling = item.needsFill

  async function save() {
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
      await state.updateItemCard(itemId, {
        name,
        mode,
        category,
        subcategory,
        unit: mode === 'durable' ? 'pcs' : unit,
        quantity: qty,
        note,
        needsFill: false,
      })
      state.navigate({ name: 'item', itemId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>{filling ? 'Заполнить карточку' : 'Изменить карточку'}</strong>
        {filling ? (
          <p className="muted">
            Укажите фактические данные. После сохранения метка «Требует заполнения» снимется, позиция
            начнёт учитываться в остатках.
          </p>
        ) : null}
        <p className="muted">Место: {placePath}</p>
        <p className="muted">Чтобы сменить место — сохраните карточку и нажмите «Перенести».</p>

        <label className="field">
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label className="field">
          Режим учёта
          <select
            value={mode}
            onChange={(e) => {
              const next = e.target.value as AccountingMode
              setMode(next)
              if (next === 'durable' && (!quantity || quantity === '0')) setQuantity('1')
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

        <label className="field">
          Подкатегория
          <input
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            placeholder="Электрические"
          />
        </label>

        <div className="row">
          <label className="field grow">
            Количество
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode={mode === 'durable' ? 'numeric' : 'decimal'}
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
          <button type="button" disabled={busy} onClick={() => void save()}>
            {filling ? 'Сохранить и учесть' : 'Сохранить'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => state.navigate({ name: 'item', itemId })}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
