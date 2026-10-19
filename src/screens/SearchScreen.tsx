import { useState } from 'react'
import { ModeCategory } from '../components/ModeCategory'
import type { KeepItState } from '../hooks/useKeepIt'
import { normalizeCategoryName } from '../data/categories'
import { isItemLent, normalizeSearch } from '../data/repository'
import { formatQty } from '../data/units'
import type { Item } from '../types'

type SearchMode = 'name' | 'category'

/** Что искали в последний раз: восстанавливается при возврате из карточки вещи. */
const lastSearch: { mode: SearchMode; query: string; category: string | null; sub: string } = {
  mode: 'name',
  query: '',
  category: null,
  sub: '',
}

const NO_CATEGORY = ''

function ItemRow({ state, item }: { state: KeepItState; item: Item }) {
  const place = state.findPlace(item.placeId)
  const path = place ? state.pathFor(place.id).map((p) => p.name).join(' → ') : '—'
  return (
    <button type="button" className="list-item" onClick={() => state.navigate({ name: 'item', itemId: item.id })}>
      <span className="stack-tight">
        <strong>{item.name}</strong>
        <span className="muted">
          <ModeCategory mode={item.mode} category={item.category} subcategory={item.subcategory} />
        </span>
        <span className="muted">{path}</span>
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

  const items = state.items
  const q = normalizeSearch(query)

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
      </div>

      {mode === 'name' ? (
        <NameResults state={state} items={items} q={q} />
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

function NameResults({ state, items, q }: { state: KeepItState; items: Item[]; q: string }) {
  const results = q ? items.filter((item) => normalizeSearch(item.name).includes(q)) : items
  return (
    <div className="panel stack">
      <span className="muted">{q ? `Найдено: ${results.length}` : `Все вещи: ${results.length}`}</span>
      <div className="list">
        {results.length === 0 ? <p className="muted">Ничего не найдено в активном объекте</p> : null}
        {results.map((item) => (
          <ItemRow key={item.id} state={state} item={item} />
        ))}
      </div>
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
      <span className="muted">Категории с вещами в активном объекте</span>
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
