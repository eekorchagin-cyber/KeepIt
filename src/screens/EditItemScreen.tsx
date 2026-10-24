import { useState } from 'react'
import { CategoryPicker } from '../components/CategoryPicker'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { AutoGrowInput } from '../components/AutoGrowInput'
import { MODE_OPTIONS } from '../data/modes'
import type { KeepItState } from '../hooks/useKeepIt'
import { unitForMode, unitOptionsFor } from '../data/units'
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
      if (!category.trim()) throw new Error('Выберите категорию из справочника')
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
        unit: unitForMode(mode, unit),
        quantity: qty,
        note,
        needsFill: false,
      })
      // К месту хранения с этой вещью; карточка и редактирование не остаются в истории «←»
      state.returnTo({ name: 'place', placeId: item!.placeId })
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
          <AutoGrowInput value={name} onChange={setName} autoFocus />
        </label>

        <label className="field">
          Режим учёта
          <ChoiceSelect
            title="Режим учёта"
            value={mode}
            options={MODE_OPTIONS}
            onChange={(next) => {
              setMode(next)
              setUnit((current) => unitForMode(next, current))
              if (next === 'durable' && (!quantity || quantity === '0')) setQuantity('1')
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
          <button type="button" disabled={busy} onClick={() => void save()}>
            {filling ? 'Сохранить и учесть' : 'Сохранить'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => state.goBack()}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
