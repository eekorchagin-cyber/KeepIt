import { useMemo, useState } from 'react'
import type { KeepItState } from '../hooks/useKeepIt'
import { formatQty } from '../data/units'
import { isItemLent, normalizeSearch } from '../data/repository'
import { PlaceTypeIcon } from './PlaceTypeIcon'
import { ObjectBadge } from './ObjectBadge'
import type { PlaceType } from '../types'

const SEARCH_LIMIT = 40

/**
 * Пошаговый выбор места (и опционально вещи) для печати QR-метки.
 * Тумблер «С вещами» / «Только места» задаётся снаружи через includeItems.
 */
export function PlaceStepPicker({
  state,
  placeId,
  itemId = null,
  includeItems = false,
  onSelectPlace,
  onSelectItem,
}: {
  state: KeepItState
  /** Текущее место обхода (и выбранное место, если вещь не выбрана) */
  placeId: string
  /** Выбранная вещь — её метка пойдёт в печать */
  itemId?: string | null
  /** Показывать вещи в поиске и в списке текущего места */
  includeItems?: boolean
  onSelectPlace: (placeId: string) => void
  onSelectItem: (itemId: string) => void
}) {
  const [query, setQuery] = useState('')
  const path = placeId ? state.pathFor(placeId) : []
  const current = path[path.length - 1]
  const children = current
    ? state.childPlaces(current.id)
    : state.places
        .filter((place) => place.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const itemsHere =
    includeItems && current
      ? state.allItems
          .filter((item) => item.placeId === current.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      : []
  const selectedItem =
    itemId && includeItems
      ? (state.findItem(itemId) ?? state.allItems.find((entry) => entry.id === itemId))
      : undefined

  const q = normalizeSearch(query)
  const matches = useMemo(() => {
    if (!q) return []
    const placeHits = state.places.map((place) => {
      const label = state
        .pathFor(place.id)
        .map((part) => part.name)
        .join(' / ')
      const { places: nested, items } = state.contentsOf(place.id)
      const parts: string[] = []
      if (nested > 0) parts.push(`мест: ${nested}`)
      if (items > 0) parts.push(`${items} поз.`)
      return {
        kind: 'place' as const,
        id: place.id,
        name: place.name,
        placeType: place.type as PlaceType,
        label,
        hint: parts.length ? parts.join(' · ') : 'пусто',
      }
    })
    const itemHits = includeItems
      ? state.allItems.map((item) => {
          const label = state
            .pathFor(item.placeId)
            .map((part) => part.name)
            .join(' / ')
          return {
            kind: 'item' as const,
            id: item.id,
            name: item.name,
            placeType: null as PlaceType | null,
            label,
            hint: isItemLent(item) ? `у ${item.lentTo}` : formatQty(item.quantity, item.unit),
          }
        })
      : []
    return [...placeHits, ...itemHits]
      .filter((entry) => normalizeSearch(`${entry.name} ${entry.label}`).includes(q))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru') || a.name.localeCompare(b.name, 'ru'))
  }, [q, includeItems, state])

  function contentsHint(id: string): string {
    const { places, items } = state.contentsOf(id)
    const parts: string[] = []
    if (places > 0) parts.push(`мест: ${places}`)
    if (items > 0) parts.push(`${items} поз.`)
    if (parts.length === 0) return 'пусто'
    return parts.join(' · ')
  }

  function pickPlace(id: string) {
    setQuery('')
    onSelectPlace(id)
  }

  function pickItem(id: string) {
    setQuery('')
    onSelectItem(id)
  }

  return (
    <div className="stack">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={includeItems ? 'Найти место или вещь по названию' : 'Найти место по названию или пути'}
        aria-label={includeItems ? 'Поиск места или вещи для печати метки' : 'Поиск места для печати метки'}
      />

      {q ? (
        <>
          <span className="muted">
            {matches.length > 0
              ? `Найдено: ${matches.length}${matches.length > SEARCH_LIMIT ? ` (показаны первые ${SEARCH_LIMIT})` : ''}`
              : 'Ничего не найдено'}
          </span>
          <div className="list">
            {matches.slice(0, SEARCH_LIMIT).map((entry) => {
              const selected =
                entry.kind === 'item' ? entry.id === itemId : entry.id === placeId && !itemId
              return (
                <button
                  key={`${entry.kind}:${entry.id}`}
                  type="button"
                  className={`list-item${selected ? ' selected' : ''}`}
                  onClick={() => (entry.kind === 'item' ? pickItem(entry.id) : pickPlace(entry.id))}
                >
                  <span className="stack-tight">
                    <strong>
                      {entry.kind === 'place' && entry.placeType === 'object' ? (
                        <ObjectBadge place={state.findPlace(entry.id)!} size="sm" />
                      ) : null}
                      {entry.kind === 'place' && entry.placeType && entry.placeType !== 'object' ? (
                        <PlaceTypeIcon type={entry.placeType} />
                      ) : null}
                      {entry.kind === 'item' ? <span className="muted">Вещь · </span> : null}
                      {entry.name}
                    </strong>
                    <span className="muted">{entry.label}</span>
                    <span className="muted">{entry.hint}</span>
                  </span>
                  <span className="muted" aria-hidden>
                    ›
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="step-crumbs" aria-label="Путь к месту">
            <span className="step-crumb">
              <button
                type="button"
                className={`suggest-chip step-home${current ? ' neutral' : ''}`}
                aria-label="Разделы"
                title="Разделы"
                onClick={() => pickPlace('')}
              >
                <img src="./icons/app-192.png" alt="" />
              </button>
            </span>
            {path.map((part) => (
              <span key={part.id} className="step-crumb">
                <span className="muted">›</span>
                <button
                  type="button"
                  className={`suggest-chip${part.id === current.id && !selectedItem ? '' : ' neutral'}`}
                  onClick={() => pickPlace(part.id)}
                >
                  {part.name}
                </button>
              </span>
            ))}
            {selectedItem ? (
              <span className="step-crumb">
                <span className="muted">›</span>
                <button type="button" className="suggest-chip">
                  {selectedItem.name}
                </button>
              </span>
            ) : null}
          </div>

          {children.length > 0 ? (
            <>
              <span className="muted">{current ? 'Вложенные места:' : 'Выберите раздел:'}</span>
              <div className="list">
                {children.map((child) => (
                  <button key={child.id} type="button" className="list-item" onClick={() => pickPlace(child.id)}>
                    <span className="stack-tight">
                      <strong>
                        {child.type === 'object' ? <ObjectBadge place={child} size="sm" /> : null}
                        {child.type !== 'object' ? <PlaceTypeIcon type={child.type} /> : null}
                        {child.name}
                      </strong>
                      <span className="muted">{contentsHint(child.id)}</span>
                    </span>
                    <span className="muted" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {includeItems && itemsHere.length > 0 ? (
            <>
              <span className="muted">Вещи здесь — метка QR на вещь:</span>
              <div className="list">
                {itemsHere.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`list-item${item.id === itemId ? ' selected' : ''}`}
                    onClick={() => pickItem(item.id)}
                  >
                    <span className="stack-tight">
                      <strong>{item.name}</strong>
                      <span className="muted">
                        {isItemLent(item) ? `у ${item.lentTo}` : formatQty(item.quantity, item.unit)}
                      </span>
                    </span>
                    <span className="muted" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {current && children.length === 0 && itemsHere.length === 0 ? (
            <span className="muted">
              {includeItems
                ? `Здесь пусто. Выбрано место «${current.name}» — можно напечатать метку на это место.`
                : `Вложенных мест нет. Выбрано «${current.name}»${
                    state.contentsOf(current.id).items > 0
                      ? ` · вещей здесь и внутри: ${state.contentsOf(current.id).items} поз. Включите «С вещами», чтобы выбрать вещь.`
                      : ''
                  }.`}
            </span>
          ) : null}

          {includeItems && current && !selectedItem && (children.length > 0 || itemsHere.length > 0) ? (
            <span className="muted">
              Выбрано место «{current.name}» — метка на место. Чтобы метка была на вещь, нажмите её в списке или
              найдите по названию.
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}
