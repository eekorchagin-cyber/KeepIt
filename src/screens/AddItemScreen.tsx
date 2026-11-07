import { useEffect, useRef, useState } from 'react'
import { CategoryPicker } from '../components/CategoryPicker'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { MODE_OPTIONS } from '../data/modes'
import type { KeepItState } from '../hooks/useKeepIt'
import { findName } from '../data/itemNames'
import { normalizeSearch } from '../data/repository'
import { scanKey } from '../data/placeCodes'
import {
  lookupProductByBarcode,
  parseGtinBarcode,
  productLookupSourceLabel,
  type ProductLookupResult,
} from '../data/productLookup'
import { unitForMode, unitOptionsFor } from '../data/units'
import { ChoosePlaceSheet } from '../components/MoveItemSheet'
import { ScanCodeSheet } from '../components/ScanCodeSheet'
import { AutoGrowInput } from '../components/AutoGrowInput'
import { PlaceTypeIcon } from '../components/PlaceTypeIcon'
import { PLACE_TYPES, canNest } from '../data/placeTypes'
import type { AccountingMode, PlaceType, UnitCode } from '../types'

type LookupStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; result: ProductLookupResult }
  | { state: 'miss' }
  | { state: 'skipped' }

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
  /** Заводской QR/штрихкод или код со сканера: присвоится сохранённой вещи или новому месту */
  const [pendingCode, setPendingCode] = useState(code ?? null)
  const [scanningCode, setScanningCode] = useState(false)
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
  const [lookup, setLookup] = useState<LookupStatus>({ state: 'idle' })
  /** Название подставлено из базы — при новом скане можно заменить; ручной ввод защищён */
  const nameFromLookupRef = useRef(false)
  const nameRef = useRef(name)
  nameRef.current = name

  useEffect(() => {
    if (!pendingCode || kind !== 'item') {
      setLookup({ state: 'idle' })
      return
    }
    if (!parseGtinBarcode(pendingCode)) {
      setLookup({ state: 'skipped' })
      return
    }
    const controller = new AbortController()
    setLookup({ state: 'loading' })
    void lookupProductByBarcode(pendingCode, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (!result) {
        setLookup({ state: 'miss' })
        return
      }
      setLookup({ state: 'found', result })
      const current = nameRef.current.trim()
      if (!current || nameFromLookupRef.current) {
        onNameChange(result.name, true)
      }
    })
    return () => controller.abort()
    // onNameChange стабилен по смыслу; category внутри него читается из замыкания
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCode, kind])

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

  function onNameChange(value: string, fromLookup = false) {
    nameFromLookupRef.current = fromLookup
    setName(value)
    const known = findName(state.itemNames, value)
    if (!known?.category || category.trim()) return
    setCategory(known.category)
    setSubcategory(known.subcategory)
    setMode(known.mode)
    setUnit(unitForMode(known.mode, known.unit))
  }

  function applyLookupName(result: ProductLookupResult) {
    onNameChange(result.name, true)
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
        nameFromLookupRef.current = false
        setLookup({ state: 'idle' })
        setNote('')
        setQuantity('1')
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
  const pendingKey = pendingCode ? scanKey(pendingCode) : ''
  const codeOwnerPlace = pendingKey
    ? state.places.find((entry) => entry.extraCodes?.includes(pendingKey))
    : undefined
  const codeOwnerItem = pendingKey
    ? state.allItems.find((entry) => entry.extraCodes?.includes(pendingKey))
    : undefined
  const codeOwnerName = codeOwnerItem?.name ?? codeOwnerPlace?.name

  return (
    <div className="stack">
      <div className="panel stack-tight">
        {pendingCode ? (
          <>
            <span className="muted">Код для присвоения</span>
            <strong className="assign-code-value">{shownCode}</strong>
            {kind === 'item' && lookup.state === 'loading' ? (
              <span className="muted">Ищу название товара по штрихкоду…</span>
            ) : null}
            {kind === 'item' && lookup.state === 'found' ? (
              <div className="stack-tight">
                <span className="scan-feedback ok">
                  Название из {productLookupSourceLabel(lookup.result.source)}: «{lookup.result.name}»
                </span>
                {name.trim() !== lookup.result.name ? (
                  <button type="button" className="secondary" onClick={() => applyLookupName(lookup.result)}>
                    Подставить это название
                  </button>
                ) : null}
              </div>
            ) : null}
            {kind === 'item' && lookup.state === 'miss' ? (
              <div className="stack-tight">
                <span className="muted">В открытых базах товар не найден — введите название сами.</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const q = encodeURIComponent(pendingCode)
                    window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener,noreferrer')
                  }}
                >
                  Искать этот код в Google
                </button>
              </div>
            ) : null}
            {kind === 'item' && lookup.state === 'skipped' ? (
              <span className="muted">
                Автопоиск названия работает для заводских EAN/UPC (цифровой штрихкод). Для этого кода введите название
                вручную.
              </span>
            ) : null}
            <span className="muted">
              Код определён. Теперь заполните данные об объекте в карточке и сохраните данные.
            </span>
            <span className="muted">
              При сохранении код будет присвоен {kind === 'item' ? 'новой вещи' : 'новому месту хранения'} — потом его
              скан откроет {kind === 'item' ? 'карточку' : 'это место'}. Напечатанная метка KeepIt — всегда QR программы.
            </span>
            {codeOwnerName ? (
              <span className="muted">Сейчас код присвоен «{codeOwnerName}» — при сохранении перейдёт к новой карточке.</span>
            ) : null}
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
            <div className="row wrap">
              <button type="button" className="secondary" onClick={() => setScanningCode(true)}>
                Сканировать другой
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setPendingCode(null)
                  setLookup({ state: 'idle' })
                }}
              >
                Убрать код
              </button>
            </div>
            <button
              type="button"
              className="ghost assigned-codes-toggle"
              onClick={() => state.replaceScreen({ name: 'assign-code', code: pendingCode })}
            >
              Вещь или место уже есть в KeepIt — присвоить им этот код
            </button>
          </>
        ) : (
          <>
            <strong>Штрих-код или QR на вещи</strong>
            <span className="muted">
              Если у вещи уже есть заводской штрихкод или QR — присвойте его карточке: потом скан откроет эту вещь. Для
              EAN/UPC программа попробует подставить название из открытых баз товаров. Напечатанная метка KeepIt всегда
              QR программы, не копия заводского кода.
            </span>
            <button type="button" className="secondary" onClick={() => setScanningCode(true)}>
              Присвоить штрих-код или QR
            </button>
          </>
        )}
      </div>

      {scanningCode ? (
        <ScanCodeSheet
          title="Код вещи"
          hint="Наведите камеру на заводской штрихкод или QR на вещи — или введите код вручную."
          onCapture={(raw) => {
            setPendingCode(raw.trim())
            setKind('item')
            setScanningCode(false)
          }}
          onClose={() => setScanningCode(false)}
        />
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
            <AutoGrowInput
              className="name-input"
              value={name}
              onChange={(value) => {
                setTypingName(true)
                onNameChange(value)
              }}
              onBlur={() => setTypingName(false)}
              placeholder="Дрель"
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
                placeholder="1"
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
