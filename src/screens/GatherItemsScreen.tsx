import { useState } from 'react'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { ModeCategory } from '../components/ModeCategory'
import type { KeepItState } from '../hooks/useKeepIt'
import { movesWithContents, normalizeSearch } from '../data/repository'
import { canNest, nestError } from '../data/placeTypes'
import { parseItemIdFromScan, parsePlaceFromScan } from '../data/placeCodes'
import { MoveQrScan, type RawScanResult } from '../components/MoveItemSheet'
import { formatQty } from '../data/units'
import { PlaceTypeIcon } from '../components/PlaceTypeIcon'
import type { Place } from '../types'

/** Перенос в текущее место вещей и коробок из любого другого места этого объекта. */
export function GatherItemsScreen({ state, placeId }: { state: KeepItState; placeId: string }) {
  const place = state.findPlace(placeId)
  const path = state.pathFor(placeId)
  const ancestors = path.slice(0, -1).reverse()
  const ancestorIds = new Set(ancestors.map((entry) => entry.id))

  /** Коробки/контейнеры переносятся с содержимым, остальные места — только пустыми. */
  function movablePlaces(sourceId: string): Place[] {
    return state.childPlaces(sourceId).filter((child) => {
      if (child.id === placeId || ancestorIds.has(child.id)) return false
      // Полку — не в полку, стеллаж — не в стеллаж и т. д.
      if (place && !canNest(place.type, child.type)) return false
      if (movesWithContents(child.type)) return true
      const contents = state.contentsOf(child.id)
      return contents.places + contents.items === 0
    })
  }

  function contentCount(sourceId: string): number {
    return state.itemsInPlace(sourceId).length + movablePlaces(sourceId).length
  }

  const otherPlaces = place
    ? state.places
        .filter(
          (entry) => entry.objectKey === place.objectKey && entry.id !== placeId && !ancestorIds.has(entry.id),
        )
        .map((entry) => ({
          id: entry.id,
          label: state
            .pathFor(entry.id)
            .slice(1)
            .map((part) => part.name)
            .join(' / ') || entry.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    : []

  const [sourceId, setSourceId] = useState<string | null>(
    () =>
      ancestors.find((entry) => contentCount(entry.id) > 0)?.id ?? ancestors[0]?.id ?? otherPlaces[0]?.id ?? null,
  )
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => new Set())
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!place) {
    return (
      <div className="panel">
        <p>Место не найдено</p>
      </div>
    )
  }

  const sourceItems = sourceId ? state.itemsInPlace(sourceId) : []
  const sourcePlaces = sourceId ? movablePlaces(sourceId) : []
  const q = normalizeSearch(query)
  const visibleItems = q
    ? sourceItems.filter((item) =>
        normalizeSearch([item.name, item.category, item.subcategory, item.note].join(' ')).includes(q),
      )
    : sourceItems
  const visiblePlaces = q ? sourcePlaces.filter((entry) => normalizeSearch(entry.name).includes(q)) : sourcePlaces

  // Отметки копятся из разных мест: смена «Откуда взять» и сканирование их не сбрасывают
  const pickedPlaces = [...selectedPlaces].flatMap((id) => {
    const entry = state.findPlace(id)
    return entry ? [entry] : []
  })
  const pickedItems = [...selectedItems].flatMap((id) => {
    const item = state.findItem(id)
    return item ? [item] : []
  })
  const itemIds = pickedItems.map((item) => item.id)
  const placeIds = pickedPlaces.map((entry) => entry.id)
  const selectedCount = itemIds.length + placeIds.length
  const visibleCount = visibleItems.length + visiblePlaces.length
  const allVisibleChecked =
    visibleCount > 0 &&
    visibleItems.every((item) => selectedItems.has(item.id)) &&
    visiblePlaces.every((entry) => selectedPlaces.has(entry.id))
  const sourceIsOther = Boolean(sourceId && !ancestorIds.has(sourceId))

  function toggleIn(setter: typeof setSelectedItems, id: string) {
    setter((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisible() {
    const apply = (current: Set<string>, ids: string[]) => {
      const next = new Set(current)
      for (const id of ids) {
        if (allVisibleChecked) next.delete(id)
        else next.add(id)
      }
      return next
    }
    setSelectedItems((current) => apply(current, visibleItems.map((item) => item.id)))
    setSelectedPlaces((current) => apply(current, visiblePlaces.map((entry) => entry.id)))
  }

  function chooseSource(id: string) {
    setSourceId(id || null)
    setQuery('')
    setMessage(null)
    setError(null)
  }

  function pathLabel(placeIdOf: string): string {
    const parts = state.pathFor(placeIdOf)
    return (parts.length > 1 ? parts.slice(1) : parts).map((part) => part.name).join(' / ')
  }

  /**
   * QR коробки, места или вещи: добавляем её в список «К переносу», камера остаётся включённой.
   * Проверка — по данным в памяти, без чтения базы: сигнал звучит сразу после распознавания.
   */
  async function onScanned(raw: string): Promise<RawScanResult> {
    if (!place) return { ok: false, text: 'Место не найдено' }
    setError(null)
    setMessage(null)
    const itemId = parseItemIdFromScan(raw)
    if (itemId) {
      const item = state.findItem(itemId)
      if (!item) return { ok: false, text: 'Вещь по этой метке не найдена — возможно, она удалена.' }
      if (item.placeId === place.id) return { ok: false, text: `«${item.name}» уже лежит здесь.` }
      if (selectedItems.has(item.id)) return { ok: false, text: `«${item.name}» уже в списке к переносу.` }
      setSelectedItems((current) => new Set(current).add(item.id))
      return { ok: true, text: `Добавлено: ${item.name}` }
    }
    const scanned = parsePlaceFromScan(raw, state.places)
    const reject = (text: string): RawScanResult => ({ ok: false, text })
    if (!scanned) return reject('QR не распознан: это не метка KeepIt или место удалено.')
    if (scanned.id === place.id) {
      return reject('Это метка этого же места — отсканируйте коробку или вещь, которую нужно перенести.')
    }
    if (ancestorIds.has(scanned.id) || scanned.type === 'object') {
      return reject(`«${scanned.name}» нельзя перенести сюда: оно снаружи этого места.`)
    }
    if (scanned.parentId === place.id) return reject(`«${scanned.name}» уже лежит здесь.`)
    if (!canNest(place.type, scanned.type)) return reject(nestError(place.type, scanned.type))
    const contents = state.contentsOf(scanned.id)
    if (!movesWithContents(scanned.type) && contents.places + contents.items > 0) {
      return reject(`«${scanned.name}» не пустое: с содержимым переносятся только коробки и контейнеры.`)
    }
    if (selectedPlaces.has(scanned.id)) return reject(`«${scanned.name}» уже в списке к переносу.`)
    setSelectedPlaces((current) => new Set(current).add(scanned.id))
    return { ok: true, text: `Добавлено: ${scanned.name}` }
  }

  function unpick(setter: typeof setSelectedItems, id: string) {
    setter((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  async function moveSelected() {
    if (selectedCount === 0 || !place) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const movedPlaces = placeIds.length ? await state.relocatePlaces(placeIds, place.id) : 0
      const movedItems = itemIds.length ? await state.relocateItems(itemIds, place.id) : 0
      setSelectedItems(new Set())
      setSelectedPlaces(new Set())
      const parts = [
        movedPlaces ? `мест: ${movedPlaces}` : '',
        movedItems ? `вещей: ${movedItems}` : '',
      ].filter(Boolean)
      setMessage(`Перенесено в «${place.name}» — ${parts.join(', ')}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось перенести')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Перенести в «{place.name}»</strong>
        <p className="muted">Откуда взять вещи и коробки:</p>
        {ancestors.length > 0 ? (
          <div className="chip-row">
            {ancestors.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`suggest-chip${entry.id === sourceId ? '' : ' neutral'}`}
                onClick={() => chooseSource(entry.id)}
              >
                {entry.name} · {contentCount(entry.id)}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="secondary" onClick={() => setScanning((current) => !current)}>
          {scanning ? 'Закрыть сканер' : 'Сканировать QR коробки или вещи'}
        </button>
        {scanning ? (
          <MoveQrScan
            busy={busy}
            continuous
            hint="Сканируйте метки коробок, мест и вещей подряд — каждая добавится в список «К переносу»"
            actionLabel="Добавить по коду"
            manualPlaceholder="Код или путь коробки"
            onResolved={() => undefined}
            onRawScan={onScanned}
            onFail={() => undefined}
          />
        ) : null}
        {otherPlaces.length > 0 ? (
          <label className="field">
            Другое место
            <ChoiceSelect
              title="Откуда взять"
              value={sourceIsOther ? (sourceId ?? '') : ''}
              placeholder="— выберите место —"
              options={otherPlaces.map((entry) => ({ value: entry.id, label: entry.label }))}
              onChange={chooseSource}
            />
          </label>
        ) : null}
      </div>

      {sourceId ? (
        <div className="panel stack">
          {sourceItems.length + sourcePlaces.length === 0 ? (
            <p className="muted">В «{state.findPlace(sourceId)?.name}» нечего переносить.</p>
          ) : (
            <>
              {sourceItems.length + sourcePlaces.length > 8 ? (
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Найти по названию или категории"
                  aria-label="Поиск"
                />
              ) : null}
              <div className="row">
                <span className="grow muted">
                  {q ? `Найдено: ${visibleCount}` : `Мест: ${sourcePlaces.length} · вещей: ${sourceItems.length}`}
                </span>
                <button type="button" className="ghost" disabled={visibleCount === 0} onClick={toggleVisible}>
                  {allVisibleChecked ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>

              {visiblePlaces.length > 0 ? (
                <>
                  <strong>Коробки и места</strong>
                  <div className="list">
                    {visiblePlaces.map((entry) => {
                      const contents = state.contentsOf(entry.id)
                      return (
                        <label key={entry.id} className="check-row">
                          <input
                            type="checkbox"
                            checked={selectedPlaces.has(entry.id)}
                            onChange={() => toggleIn(setSelectedPlaces, entry.id)}
                          />
                          <span className="stack-tight">
                            <strong>
                              <PlaceTypeIcon type={entry.type} />
                              {entry.name}
                            </strong>
                            <span className="muted">
                              {contents.items + contents.places === 0
                                ? 'пусто'
                                : `переносится с содержимым: вещей ${contents.items}` +
                                  (contents.places ? `, мест ${contents.places}` : '')}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </>
              ) : null}

              {visibleItems.length > 0 ? (
                <>
                  {visiblePlaces.length > 0 ? <strong>Вещи</strong> : null}
                  <div className="list">
                    {visibleItems.map((item) => (
                      <label key={item.id} className="check-row">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleIn(setSelectedItems, item.id)}
                        />
                        <span className="stack-tight">
                          <strong>{item.name}</strong>
                          <span className="muted">
                            {formatQty(item.quantity, item.unit)} ·{' '}
                            <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="panel stack">
          <div className="row">
            <strong className="grow">К переносу: {selectedCount}</strong>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setSelectedItems(new Set())
                setSelectedPlaces(new Set())
              }}
            >
              Очистить
            </button>
          </div>
          <div className="list">
            {pickedPlaces.map((entry) => (
              <div key={entry.id} className="row gather-picked">
                <span className="stack-tight grow">
                  <strong>
                    <PlaceTypeIcon type={entry.type} />
                    {entry.name}
                  </strong>
                  <span className="muted">из: {entry.parentId ? pathLabel(entry.parentId) : '—'}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Убрать «${entry.name}» из списка`}
                  onClick={() => unpick(setSelectedPlaces, entry.id)}
                >
                  ×
                </button>
              </div>
            ))}
            {pickedItems.map((item) => (
              <div key={item.id} className="row gather-picked">
                <span className="stack-tight grow">
                  <strong>{item.name}</strong>
                  <span className="muted">
                    {formatQty(item.quantity, item.unit)} · из: {pathLabel(item.placeId)}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Убрать «${item.name}» из списка`}
                  onClick={() => unpick(setSelectedItems, item.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" className="secondary" onClick={() => state.jump({ name: 'place', placeId })}>
        Готово — к месту «{place.name}»
      </button>

      <div className="panel stack sticky-actions">
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <span className="grow muted">Отмечено: {selectedCount}</span>
          <button type="button" disabled={busy || selectedCount === 0} onClick={() => void moveSelected()}>
            Перенести сюда{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
