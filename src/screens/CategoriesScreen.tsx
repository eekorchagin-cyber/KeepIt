import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizeCategoryName } from '../data/categories'
import type { KeepItState } from '../hooks/useKeepIt'
import type { Item } from '../types'

type Draft =
  | { kind: 'add-category' }
  | { kind: 'rename-category'; name: string }
  | { kind: 'add-sub'; category: string }
  | { kind: 'rename-sub'; category: string; name: string }
  | null

type DragPayload = { kind: 'category'; name: string } | { kind: 'sub'; category: string; name: string }

type DragState = DragPayload & { x: number; y: number; over: string | null }

function thingCount(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} вещь`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} вещи`
  return `${count} вещей`
}

function countItems(items: Item[], category: string, subcategory?: string): number {
  return items.filter((item) => {
    if (normalizeCategoryName(item.category) !== normalizeCategoryName(category)) return false
    if (subcategory === undefined) return true
    return normalizeCategoryName(item.subcategory) === normalizeCategoryName(subcategory)
  }).length
}

function dropCategoryAt(x: number, y: number, payload: DragPayload): string | null {
  const zone = document.elementFromPoint(x, y)?.closest('[data-drop-category]')
  const name = zone?.getAttribute('data-drop-category')
  if (!name) return null
  if (payload.kind === 'category' && normalizeCategoryName(name) === normalizeCategoryName(payload.name)) {
    return null
  }
  if (payload.kind === 'sub' && normalizeCategoryName(name) === normalizeCategoryName(payload.category)) {
    return null
  }
  return name
}

function scrollCatalog(clientY: number): void {
  const main = document.querySelector('.app-main')
  if (!main) return
  const rect = main.getBoundingClientRect()
  if (clientY < rect.top + 64) main.scrollTop -= 18
  else if (clientY > rect.bottom - 64) main.scrollTop += 18
}

export function CategoriesScreen({ state }: { state: KeepItState }) {
  const tree = state.categories
  const [draft, setDraft] = useState<Draft>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  function startDraft(next: Draft, initial = '') {
    setError(null)
    setValue(initial)
    setDraft(next)
  }

  async function submitDraft() {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      if (draft.kind === 'add-category') await state.addCategory(value)
      if (draft.kind === 'rename-category') await state.renameCategory(draft.name, value)
      if (draft.kind === 'add-sub') await state.addSubcategory(draft.category, value)
      if (draft.kind === 'rename-sub') await state.renameSubcategory(draft.category, draft.name, value)
      setDraft(null)
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function removeCategory(name: string) {
    if (!confirm(`Удалить категорию «${name}»?`)) return
    setBusy(true)
    setError(null)
    try {
      await state.deleteCategory(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function removeSub(category: string, name: string) {
    if (!confirm(`Удалить подкатегорию «${name}»?`)) return
    setBusy(true)
    setError(null)
    try {
      await state.deleteSubcategory(category, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function applyDrop(payload: DragPayload, target: string) {
    setError(null)
    if (payload.kind === 'category') {
      const ok = confirm(
        `Сделать «${payload.name}» подкатегорией «${target}»?\n\nУ вещей, где подкатегория уже указана, она останется. Вещи без подкатегории получат «${payload.name}».`,
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      if (payload.kind === 'sub') await state.moveSubcategory(payload.category, payload.name, target)
      else await state.demoteCategory(payload.name, target)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, payload: DragPayload) {
    if (busy || event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // Жест всё равно слушаем на окне: палец может уйти с ручки.
    }
    const startX = event.clientX
    const startY = event.clientY
    let started = false

    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return
      started = true
      setDrag({ ...payload, x: ev.clientX, y: ev.clientY, over: dropCategoryAt(ev.clientX, ev.clientY, payload) })
      scrollCatalog(ev.clientY)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDrag(null)
      if (!started) return
      const target = dropCategoryAt(ev.clientX, ev.clientY, payload)
      if (target) void applyDrop(payload, target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div className="stack screen-fill">
      <div className="panel stack">
        <strong>Справочник категорий</strong>
      </div>

      {error && !draft ? <p className="error">{error}</p> : null}

      <div className="stack">
        {tree.map((entry) => {
          const categoryCount = countItems(state.allItems, entry.name)
          const source =
            drag?.kind === 'category' && normalizeCategoryName(drag.name) === normalizeCategoryName(entry.name)
          const over =
            drag?.over != null && normalizeCategoryName(drag.over) === normalizeCategoryName(entry.name)
          return (
            <section
              key={entry.name}
              className={`catalog-block${source ? ' drag-source' : ''}${over ? ' drop-target' : ''}`}
              data-drop-category={entry.name}
            >
              <div className="list-item catalog-row catalog-category with-handle">
                <button
                  type="button"
                  className="icon-btn drag-handle"
                  disabled={busy}
                  aria-label={`Перетащить категорию ${entry.name}`}
                  onPointerDown={(event) => onHandlePointerDown(event, { kind: 'category', name: entry.name })}
                >
                  ⋮⋮
                </button>
                <div className="grow catalog-category-text">
                  <span className="muted catalog-category-label">Категория</span>
                  <strong>{entry.name}</strong>
                  {categoryCount > 0 ? <span className="muted">{thingCount(categoryCount)}</span> : null}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  aria-label="Изменить"
                  onClick={() => startDraft({ kind: 'rename-category', name: entry.name }, entry.name)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  aria-label="Удалить"
                  onClick={() => void removeCategory(entry.name)}
                >
                  ×
                </button>
              </div>
              {entry.children.length > 0 ? (
                <div className="catalog-subs">
                  {entry.children.map((child) => {
                    const subCount = countItems(state.allItems, entry.name, child)
                    const subSource =
                      drag?.kind === 'sub' &&
                      normalizeCategoryName(drag.category) === normalizeCategoryName(entry.name) &&
                      normalizeCategoryName(drag.name) === normalizeCategoryName(child)
                    return (
                      <div key={child} className={`list-item catalog-row with-handle${subSource ? ' drag-source' : ''}`}>
                        <button
                          type="button"
                          className="icon-btn drag-handle"
                          disabled={busy}
                          aria-label={`Перетащить подкатегорию ${child}`}
                          onPointerDown={(event) =>
                            onHandlePointerDown(event, { kind: 'sub', category: entry.name, name: child })
                          }
                        >
                          ⋮⋮
                        </button>
                        <span className="grow">
                          <strong>{child}</strong>
                          {subCount > 0 ? <span className="muted">{thingCount(subCount)}</span> : null}
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={busy}
                          aria-label="Изменить"
                          onClick={() =>
                            startDraft({ kind: 'rename-sub', category: entry.name, name: child }, child)
                          }
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={busy}
                          aria-label="Удалить"
                          onClick={() => void removeSub(entry.name, child)}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="muted catalog-empty">Подкатегорий пока нет</p>
              )}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => startDraft({ kind: 'add-sub', category: entry.name })}
              >
                Добавить подкатегорию
              </button>
            </section>
          )
        })}
        <button type="button" disabled={busy} onClick={() => startDraft({ kind: 'add-category' })}>
          Добавить категорию
        </button>
      </div>

      {drag ? (
        <div className="catalog-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.kind === 'category' ? 'Категория' : 'Подкатегория'} «{drag.name}»
          {drag.over ? <span className="muted"> → {drag.over}</span> : null}
        </div>
      ) : null}

      {draft ? (
        <div className="sheet-backdrop" onClick={() => setDraft(null)} role="presentation">
          <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
            <div className="row">
              <strong className="grow">
                {draft.kind === 'add-category'
                  ? 'Новая категория'
                  : draft.kind === 'rename-category'
                    ? 'Переименовать категорию'
                    : draft.kind === 'add-sub'
                      ? 'Новая подкатегория'
                      : 'Переименовать подкатегорию'}
              </strong>
              <button type="button" className="icon-btn" onClick={() => setDraft(null)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="stack">
              <label className="field">
                Название
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoFocus
                  placeholder="Например, Электрика"
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <button type="button" disabled={busy || !value.trim()} onClick={() => void submitDraft()}>
                Сохранить
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setDraft(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
