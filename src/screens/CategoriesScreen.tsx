import { useState } from 'react'
import { findCategoryNode } from '../data/categories'
import type { KeepItState } from '../hooks/useKeepIt'

type Draft =
  | { kind: 'add-category' }
  | { kind: 'rename-category'; name: string }
  | { kind: 'add-sub'; category: string }
  | { kind: 'rename-sub'; category: string; name: string }
  | null

export function CategoriesScreen({ state }: { state: KeepItState }) {
  const tree = state.categories
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const node = openCategory ? findCategoryNode(tree, openCategory) : null

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
      if (draft.kind === 'rename-category') {
        await state.renameCategory(draft.name, value)
        if (openCategory === draft.name) setOpenCategory(value.trim())
      }
      if (draft.kind === 'add-sub') await state.addSubcategory(draft.category, value)
      if (draft.kind === 'rename-sub') {
        await state.renameSubcategory(draft.category, draft.name, value)
      }
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
      if (openCategory === name) setOpenCategory(null)
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

  return (
    <div className="stack screen-fill">
      <div className="panel stack">
        <strong>Справочник категорий</strong>
        <p className="muted">
          Категории и вложенные подкатегории для карточек вещей. Изменения сохраняются на этом
          устройстве.
        </p>
      </div>

      {error && !draft ? <p className="error">{error}</p> : null}

      <div className="panel stack">
        {openCategory && node ? (
          <>
            <button type="button" className="ghost crumb" onClick={() => setOpenCategory(null)}>
              ← Все категории
            </button>
            <div className="row wrap">
              <strong className="grow">{node.name}</strong>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => startDraft({ kind: 'rename-category', name: node.name }, node.name)}
              >
                Переименовать
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void removeCategory(node.name)}
              >
                Удалить
              </button>
            </div>
            <strong>Подкатегории</strong>
            <div className="list">
              {node.children.length === 0 ? (
                <p className="muted">Подкатегорий пока нет</p>
              ) : (
                node.children.map((child) => (
                  <div key={child} className="list-item catalog-row">
                    <strong className="grow">{child}</strong>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        startDraft({ kind: 'rename-sub', category: node.name, name: child }, child)
                      }
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void removeSub(node.name, child)}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => startDraft({ kind: 'add-sub', category: node.name })}
            >
              Добавить подкатегорию
            </button>
          </>
        ) : (
          <>
            <div className="list">
              {tree.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  className="list-item"
                  onClick={() => setOpenCategory(entry.name)}
                >
                  <span>
                    <strong>{entry.name}</strong>
                    <span className="muted">
                      {entry.children.length > 0
                        ? `${entry.children.length} подкатегорий`
                        : 'без вложений'}
                    </span>
                  </span>
                  <span className="muted">›</span>
                </button>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={() => startDraft({ kind: 'add-category' })}>
              Добавить категорию
            </button>
          </>
        )}
      </div>

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
