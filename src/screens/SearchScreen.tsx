import { useState } from 'react'
import { ModeCategory } from '../components/ModeCategory'
import type { KeepItState } from '../hooks/useKeepIt'
import { normalizeCategoryName } from '../data/categories'
import { isItemLent, normalizeSearch } from '../data/repository'
import { formatQty } from '../data/units'
import type { Item } from '../types'

type SearchMode = 'name' | 'category'

/** Что искали в последний раз: восстанавливается при возврате из карточки вещи. */
const lastSearch: {
  mode: SearchMode
  query: string
  category: string | null
  sub: string
  unfilled: boolean
  /** Откуда открыли поиск и где искали (null — везде): «Искать везде» не сбрасывается при возврате */
  origin: string | null
  scopeId: string | null
} = {
  mode: 'name',
  query: '',
  category: null,
  sub: '',
  unfilled: false,
  origin: null,
  scopeId: null,
}

/** Место, с которого открыли поиск: место или объект — ищем в нём и во всём вложенном; иначе — везде */
function originPlaceId(state: KeepItState): string | null {
  const previous = state.previousScreen
  if (previous?.name === 'place') return state.findPlace(previous.placeId) ? previous.placeId : null
  if (previous?.name === 'object') {
    return state.places.find((place) => place.type === 'object' && place.objectKey === previous.objectKey)?.id ?? null
  }
  return null
}

/** Место и все вложенные в него на любой глубине */
function subtreeOf(state: KeepItState, rootId: string): Set<string> {
  const ids = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const place of state.places) {
      if (place.parentId && ids.has(place.parentId) && !ids.has(place.id)) {
        ids.add(place.id)
        added = true
      }
    }
  }
  return ids
}

/** Чего не хватает в карточке: пустая строка — заполнено */
function missingInfo(item: Item): string {
  const parts: string[] = []
  if (item.needsFill) parts.push('требует заполнения')
  if (item.needsCategory || !item.category.trim()) parts.push('нет категории')
  return parts.join(', ')
}

const NO_CATEGORY = ''

function ItemRow({ state, item }: { state: KeepItState; item: Item }) {
  const place = state.findPlace(item.placeId)
  const path = place ? state.pathFor(place.id).map((p) => p.name).join(' → ') : 'место не найдено'
  async function open() {
    // Вещь из другого объекта: переключаемся на него, как при сканировании
    if (place && place.objectKey !== state.settings?.activeObject) await state.setActiveObject(place.objectKey)
    state.navigate({ name: 'item', itemId: item.id })
  }
  return (
    <button type="button" className="list-item" onClick={() => void open()}>
      <span className="stack-tight">
        <strong>{item.name}</strong>
        <span className="muted">
          <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
        </span>
        <span className="muted">{path}</span>
        {missingInfo(item) ? <span className="search-missing">Не заполнено: {missingInfo(item)}</span> : null}
      </span>
      <span className={`badge${isItemLent(item) ? ' warn' : ''}`}>
        {item.needsFill ? 'заполнить' : isItemLent(item) ? `у ${item.lentTo}` : formatQty(item.quantity, item.unit)}
      </span>
    </button>
  )
}

export function SearchScreen({ state }: { state: KeepItState }) {
  const [mode, setModeState] = useState<SearchMode>(lastSearch.mode)
  const [query, setQueryState] = useState(lastSearch.query)
  const [category, setCategoryState] = useState<string | null>(lastSearch.category)
  const [sub, setSubState] = useState(lastSearch.sub)

  function setMode(next: SearchMode) {
    lastSearch.mode = next
    setModeState(next)
    setQuery('')
  }
  function setQuery(next: string) {
    lastSearch.query = next
    setQueryState(next)
  }
  function setCategory(next: string | null) {
    lastSearch.category = next
    lastSearch.sub = ''
    setCategoryState(next)
    setSubState('')
    setQuery('')
  }

  /** В режиме «По категории» строка всегда ищет категорию: ввод при выбранной — снова список категорий */
  function onQueryChange(value: string) {
    if (mode === 'category' && category !== null) {
      lastSearch.category = null
      lastSearch.sub = ''
      setCategoryState(null)
      setSubState('')
    }
    setQuery(value)
  }
  function setSub(next: string) {
    lastSearch.sub = next
    setSubState(next)
  }

  const [origin] = useState(() => originPlaceId(state))
  const [scopeId, setScopeIdState] = useState<string | null>(() =>
    lastSearch.origin === origin ? lastSearch.scopeId : origin,
  )
  function setScopeId(next: string | null) {
    lastSearch.origin = origin
    lastSearch.scopeId = next
    setScopeIdState(next)
  }
  const scopePlace = scopeId ? state.findPlace(scopeId) : undefined
  const scopeIds = scopePlace ? subtreeOf(state, scopePlace.id) : null
  // Сверху вниз: из места — по нему и всему вложенному; с главного экрана — по всем объектам
  const items = scopeIds ? state.allItems.filter((item) => scopeIds.has(item.placeId)) : state.allItems
  const q = normalizeSearch(query)
  const scopeTitle = scopePlace
    ? state
        .pathFor(scopePlace.id)
        .map((part) => part.name)
        .join(' / ')
    : ''

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="split-row">
          <button type="button" className={mode === 'name' ? undefined : 'secondary'} onClick={() => setMode('name')}>
            По названию
          </button>
          <button
            type="button"
            className={mode === 'category' ? undefined : 'secondary'}
            onClick={() => setMode('category')}
          >
            По категории
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={
            mode === 'name'
              ? 'Название вещи: дрель, топор…'
              : category === null
                ? 'Найти категорию: инструменты…'
                : 'Другая категория: оборудование…'
          }
          aria-label={mode === 'name' ? 'Поиск по названию' : 'Поиск категории'}
          autoFocus
        />
        <div className="row search-scope">
          <span className="grow muted">
            {scopePlace ? `Ищем в «${scopeTitle}» и во всём, что внутри` : 'Ищем во всех объектах'}
          </span>
          {scopePlace ? (
            <button type="button" className="ghost" onClick={() => setScopeId(null)}>
              Искать везде
            </button>
          ) : origin ? (
            <button type="button" className="ghost" onClick={() => setScopeId(origin)}>
              Только в «{state.findPlace(origin)?.name}»
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'name' ? (
        <NameResults state={state} items={items} q={q} scoped={Boolean(scopePlace)} />
      ) : category === null ? (
        <CategoryList items={items} q={q} onPick={setCategory} />
      ) : (
        <CategoryResults
          state={state}
          items={items}
          category={category}
          sub={sub}
          onBack={() => setCategory(null)}
          onSub={setSub}
        />
      )}
    </div>
  )
}

function NameResults({
  state,
  items,
  q,
  scoped,
}: {
  state: KeepItState
  items: Item[]
  q: string
  /** Ищем в одном месте: совпадения снаружи — ниже, «В других местах» */
  scoped: boolean
}) {
  const [onlyUnfilled, setOnlyUnfilledState] = useState(lastSearch.unfilled)
  function setOnlyUnfilled(next: boolean) {
    lastSearch.unfilled = next
    setOnlyUnfilledState(next)
  }
  const unfilled = items.filter((item) => missingInfo(item))
  const source = onlyUnfilled ? unfilled : items
  // Совпадения в выбранном месте — сверху; при поиске в одном месте ниже — найденное в других местах
  const inScope = new Set(items.map((item) => item.id))
  const matches = q
    ? (onlyUnfilled ? state.allItems.filter((item) => missingInfo(item)) : state.allItems).filter((item) =>
        normalizeSearch(item.name).includes(q),
      )
    : source
  const results = matches.filter((item) => inScope.has(item.id))
  const elsewhere = q && scoped ? matches.filter((item) => !inScope.has(item.id)) : []
  return (
    <div className="panel stack">
      <div className="chip-row">
        <button
          type="button"
          className={`suggest-chip${onlyUnfilled ? '' : ' neutral'}`}
          aria-pressed={onlyUnfilled}
          onClick={() => setOnlyUnfilled(!onlyUnfilled)}
        >
          Только незаполненные · {unfilled.length}
        </button>
      </div>
      <span className="muted">
        {q
          ? `Найдено: ${results.length + elsewhere.length}`
          : onlyUnfilled
            ? `Незаполненные: ${results.length}`
            : `Все вещи: ${results.length}`}
      </span>
      <div className="list">
        {results.length === 0 && elsewhere.length === 0 ? (
          <p className="muted">
            {onlyUnfilled && !q ? 'Все карточки заполнены' : scoped ? 'Ничего не найдено' : 'Ничего не найдено ни в одном объекте'}
          </p>
        ) : null}
        {results.length === 0 && elsewhere.length > 0 ? (
          <p className="muted">Здесь не найдено — есть в других местах:</p>
        ) : null}
        {results.map((item) => (
          <ItemRow key={item.id} state={state} item={item} />
        ))}
      </div>
      {elsewhere.length > 0 ? (
        <>
          {results.length > 0 ? <strong>В других местах</strong> : null}
          <div className="list">
            {elsewhere.map((item) => (
              <ItemRow key={item.id} state={state} item={item} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function CategoryList({ items, q, onPick }: { items: Item[]; q: string; onPick: (category: string) => void }) {
  const groups = new Map<string, { name: string; count: number; subs: Set<string> }>()
  for (const item of items) {
    const key = item.category.trim() ? normalizeCategoryName(item.category) : NO_CATEGORY
    const group = groups.get(key) ?? { name: item.category.trim(), count: 0, subs: new Set<string>() }
    group.count += 1
    if (item.subcategory.trim()) group.subs.add(item.subcategory.trim())
    groups.set(key, group)
  }
  const list = [...groups.entries()]
    .filter(([, group]) => {
      if (!q) return true
      const hay = normalizeSearch([group.name || 'без категории', ...group.subs].join(' '))
      return hay.includes(q)
    })
    .sort(([a, ga], [b, gb]) => {
      if (a === NO_CATEGORY) return 1
      if (b === NO_CATEGORY) return -1
      return ga.name.localeCompare(gb.name, 'ru')
    })

  return (
    <div className="panel stack">
      <span className="muted">Категории с вещами там, где ищем</span>
      <div className="list">
        {list.length === 0 ? <p className="muted">Подходящих категорий нет</p> : null}
        {list.map(([key, group]) => (
          <button key={key || 'none'} type="button" className="list-item" onClick={() => onPick(key)}>
            <span className="stack-tight">
              <strong>{group.name || 'Без категории'}</strong>
              {group.subs.size > 0 ? <span className="muted">{[...group.subs].sort((a, b) => a.localeCompare(b, 'ru')).join(', ')}</span> : null}
            </span>
            <span className="badge">{group.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function inCategoryOf(items: Item[], category: string): Item[] {
  return items.filter((item) =>
    category === NO_CATEGORY ? !item.category.trim() : normalizeCategoryName(item.category) === category,
  )
}

function categoryTitle(items: Item[], category: string): string {
  return category === NO_CATEGORY ? 'Без категории' : (inCategoryOf(items, category)[0]?.category ?? category)
}

function CategoryResults({
  state,
  items,
  category,
  sub,
  onBack,
  onSub,
}: {
  state: KeepItState
  items: Item[]
  category: string
  sub: string
  onBack: () => void
  onSub: (sub: string) => void
}) {
  const inCategory = inCategoryOf(items, category)
  const title = categoryTitle(items, category)
  const subs = new Map<string, number>()
  for (const item of inCategory) {
    const name = item.subcategory.trim()
    if (name) subs.set(name, (subs.get(name) ?? 0) + 1)
  }
  const withoutSub = inCategory.filter((item) => !item.subcategory.trim()).length
  const results = sub
    ? inCategory.filter((item) => normalizeCategoryName(item.subcategory) === normalizeCategoryName(sub))
    : inCategory

  return (
    <div className="panel stack">
      <button type="button" className="ghost crumb" onClick={onBack}>
        ← Все категории
      </button>
      <strong>
        {title} · {inCategory.length}
      </strong>
      {subs.size > 0 ? (
        <div className="chip-row">
          <button type="button" className={`suggest-chip${sub ? ' neutral' : ''}`} onClick={() => onSub('')}>
            Все · {inCategory.length}
          </button>
          {[...subs.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'ru'))
            .map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`suggest-chip${normalizeCategoryName(sub) === normalizeCategoryName(name) ? '' : ' neutral'}`}
                onClick={() => onSub(name)}
              >
                {name} · {count}
              </button>
            ))}
          {withoutSub > 0 && !sub ? <span className="muted">без подкатегории: {withoutSub}</span> : null}
        </div>
      ) : null}
      <div className="list">
        {results.length === 0 ? <p className="muted">Вещей нет</p> : null}
        {results.map((item) => (
          <ItemRow key={item.id} state={state} item={item} />
        ))}
      </div>
    </div>
  )
}
