import { useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { ObjectBadge } from '../components/ObjectBadge'
import { PlaceTypeIcon } from '../components/PlaceTypeIcon'
import { rootObjects } from '../data/icons'
import { scanKey } from '../data/placeCodes'
import { isUnusedFreeLabel, normalizeSearch } from '../data/repository'
import { formatQty } from '../data/units'
import type { ObjectKey } from '../types'

const LIST_LIMIT = 50

/** Как назвать отсканированный код для человека */
function describeCode(state: KeepItState, code: string): string {
  const key = scanKey(code)
  if (key.startsWith('place:')) {
    const place = state.findPlace(key.slice('place:'.length))
    if (!place) return 'Метка удалённого места KeepIt'
    const path = state
      .pathFor(place.id)
      .slice(0, -1)
      .map((part) => part.name)
      .join(' / ')
    return `${place.name}${path ? ` (${path})` : ''}`
  }
  if (key.startsWith('item:')) return 'Метка удалённой вещи KeepIt'
  return key.length > 80 ? `${key.slice(0, 80)}…` : key
}

/**
 * Присвоить отсканированный код — свободную метку, старую метку, чужой QR или заводской штрихкод —
 * существующей вещи или месту. Потом его скан открывает выбранное.
 */
export function AssignCodeScreen({ state, code }: { state: KeepItState; code: string }) {
  const key = scanKey(code)
  const freePlaceId = key.startsWith('place:') ? key.slice('place:'.length) : ''
  const roots = rootObjects(state.places)
  const [kind, setKind] = useState<'item' | 'place'>('item')
  const [objectKey, setObjectKey] = useState<ObjectKey | undefined>(
    () => state.settings?.activeObject ?? roots[0]?.objectKey,
  )
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ownerPlace = state.places.find((place) => place.extraCodes?.includes(key))
  const ownerItem = state.allItems.find((item) => item.extraCodes?.includes(key))
  const owner = ownerPlace?.name ?? ownerItem?.name
  const pathLabel = (placeId: string) => {
    const parts = state.pathFor(placeId)
    return (parts.length > 1 ? parts.slice(1) : parts).map((part) => part.name).join(' / ')
  }

  const objectPlaceIds = new Set(
    state.places.filter((place) => place.objectKey === objectKey).map((place) => place.id),
  )
  const q = normalizeSearch(query)
  const placeOptions = state.places
    .filter((place) => objectPlaceIds.has(place.id) && place.id !== freePlaceId && !isUnusedFreeLabel(place))
    .map((place) => ({ place, label: pathLabel(place.id) || place.name }))
    .filter((entry) => !q || normalizeSearch(entry.label).includes(q))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  const itemOptions = state.allItems
    .filter((item) => objectPlaceIds.has(item.placeId))
    .map((item) => ({ item, path: pathLabel(item.placeId) }))
    .filter((entry) => !q || normalizeSearch(`${entry.item.name} ${entry.path}`).includes(q))
    .sort((a, b) => a.item.name.localeCompare(b.item.name, 'ru'))
  const total = kind === 'item' ? itemOptions.length : placeOptions.length

  async function assign(target: { kind: 'place' | 'item'; id: string }, name: string, targetObject: ObjectKey) {
    if (!window.confirm(`Присвоить этот код «${name}»? После этого его скан будет открывать «${name}».`)) return
    setBusy(true)
    setError(null)
    try {
      await state.assignCode(code, target)
      if (targetObject !== state.settings?.activeObject) await state.setActiveObject(targetObject)
      state.replaceScreen(target.kind === 'item' ? { name: 'item', itemId: target.id } : { name: 'place', placeId: target.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось присвоить код')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="panel stack-tight">
        <span className="muted">Отсканированный код</span>
        <strong className="assign-code-value">{describeCode(state, code)}</strong>
        {owner ? (
          <span className="muted">
            Сейчас присвоен «{owner}» — при выборе другого владельца он перейдёт к нему.
          </span>
        ) : (
          <span className="muted">Выберите вещь или место — потом скан этого кода будет открывать их.</span>
        )}
      </div>

      <div className="panel stack">
        <div className="split-row">
          <button type="button" className={kind === 'item' ? undefined : 'secondary'} onClick={() => setKind('item')}>
            Вещь
          </button>
          <button type="button" className={kind === 'place' ? undefined : 'secondary'} onClick={() => setKind('place')}>
            Место хранения
          </button>
        </div>
        {roots.length > 1 ? (
          <div className="chip-row">
            {roots.map((root) => (
              <button
                key={root.id}
                type="button"
                className={`suggest-chip${root.objectKey === objectKey ? '' : ' neutral'}`}
                onClick={() => setObjectKey(root.objectKey)}
              >
                <ObjectBadge place={root} size="sm" /> {root.name}
              </button>
            ))}
          </div>
        ) : null}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={kind === 'item' ? 'Найти вещь по названию' : 'Найти место по названию или пути'}
          aria-label="Поиск"
        />
        {error ? <p className="error">{error}</p> : null}

        <div className="list">
          {kind === 'item'
            ? itemOptions.slice(0, LIST_LIMIT).map(({ item, path }) => (
                <button
                  key={item.id}
                  type="button"
                  className="list-item"
                  disabled={busy}
                  onClick={() => void assign({ kind: 'item', id: item.id }, item.name, objectKey!)}
                >
                  <span className="stack-tight">
                    <strong>{item.name}</strong>
                    <span className="muted">
                      {formatQty(item.quantity, item.unit)} · {path}
                    </span>
                  </span>
                </button>
              ))
            : placeOptions.slice(0, LIST_LIMIT).map(({ place, label }) => (
                <button
                  key={place.id}
                  type="button"
                  className="list-item"
                  disabled={busy}
                  onClick={() => void assign({ kind: 'place', id: place.id }, place.name, place.objectKey)}
                >
                  <span className="stack-tight">
                    <strong>
                      {place.type !== 'object' ? <PlaceTypeIcon type={place.type} /> : null}
                      {place.name}
                    </strong>
                    <span className="muted">{label}</span>
                  </span>
                </button>
              ))}
        </div>
        {total === 0 ? <p className="muted">Ничего не найдено.</p> : null}
        {total > LIST_LIMIT ? (
          <p className="muted">
            Показаны первые {LIST_LIMIT} из {total} — уточните поиск.
          </p>
        ) : null}
      </div>
    </div>
  )
}
