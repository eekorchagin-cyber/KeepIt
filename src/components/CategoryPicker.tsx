import { useMemo, useState } from 'react'
import { findCategoryNode, formatCategoryPath } from '../data/categories'
import type { CategoryNode } from '../types'

export function CategoryPicker({
  tree,
  category,
  subcategory,
  onChange,
}: {
  tree: CategoryNode[]
  category: string
  subcategory: string
  onChange: (next: { category: string; subcategory: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [browseCategory, setBrowseCategory] = useState<string | null>(null)

  const label = useMemo(() => {
    if (!category.trim()) return 'Выберите из справочника'
    return formatCategoryPath(category, subcategory)
  }, [category, subcategory])

  const node = browseCategory ? findCategoryNode(tree, browseCategory) : null

  function openPicker() {
    setBrowseCategory(category.trim() ? category : null)
    setOpen(true)
  }

  function pickCategory(name: string) {
    const entry = findCategoryNode(tree, name)
    if (entry && entry.children.length > 0) {
      setBrowseCategory(name)
      return
    }
    onChange({ category: name, subcategory: '' })
    setOpen(false)
    setBrowseCategory(null)
  }

  function pickSubcategory(name: string) {
    if (!browseCategory) return
    onChange({ category: browseCategory, subcategory: name })
    setOpen(false)
    setBrowseCategory(null)
  }

  function pickCategoryOnly() {
    if (!browseCategory) return
    onChange({ category: browseCategory, subcategory: '' })
    setOpen(false)
    setBrowseCategory(null)
  }

  return (
    <>
      <label className="field">
        Категория
        <button type="button" className="field-trigger" onClick={openPicker}>
          <span className={category.trim() ? undefined : 'muted'}>{label}</span>
          <span className="muted" aria-hidden>
            ›
          </span>
        </button>
      </label>

      {open ? (
        <div className="sheet-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="sheet sheet-tall"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal
          >
            <div className="row">
              <strong className="grow">
                {browseCategory ? browseCategory : 'Категория из справочника'}
              </strong>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="stack">
              {browseCategory ? (
                <>
                  <button
                    type="button"
                    className="ghost crumb"
                    onClick={() => setBrowseCategory(null)}
                  >
                    ← Все категории
                  </button>
                  <p className="muted">Выберите подкатегорию или оставьте только категорию</p>
                  <div className="list">
                    {node?.children.map((child) => (
                      <button
                        key={child}
                        type="button"
                        className="list-item"
                        onClick={() => pickSubcategory(child)}
                      >
                        <strong>{child}</strong>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="secondary" onClick={pickCategoryOnly}>
                    Без подкатегории: {browseCategory}
                  </button>
                </>
              ) : (
                <div className="list">
                  {tree.map((entry) => (
                    <button
                      key={entry.name}
                      type="button"
                      className="list-item"
                      onClick={() => pickCategory(entry.name)}
                    >
                      <span>
                        <strong>{entry.name}</strong>
                        <span className="muted">
                          {entry.children.length > 0
                            ? `${entry.children.length} подкатегорий`
                            : 'без вложений'}
                        </span>
                      </span>
                      {entry.children.length > 0 ? <span className="muted">›</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
