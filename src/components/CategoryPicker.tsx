import { useMemo, useState } from 'react'
import { findCategoryNode, formatCategoryPath } from '../data/categories'
import type { CategoryNode } from '../types'

export function CategoryPicker({
  tree,
  category,
  subcategory,
  onChange,
  fieldLabel = 'Категория',
}: {
  tree: CategoryNode[]
  category: string
  subcategory: string
  onChange: (next: { category: string; subcategory: string }) => void
  fieldLabel?: string
}) {
  const [open, setOpen] = useState(false)

  const label = useMemo(() => {
    if (!category.trim()) return 'Выберите из справочника'
    return formatCategoryPath(category, subcategory)
  }, [category, subcategory])

  return (
    <>
      <label className="field">
        {fieldLabel}
        <button type="button" className="field-trigger" onClick={() => setOpen(true)}>
          <span className={category.trim() ? undefined : 'muted'}>{label}</span>
          <span className="muted" aria-hidden>
            ›
          </span>
        </button>
      </label>

      {open ? (
        <CategorySheet
          tree={tree}
          initialCategory={category}
          onClose={() => setOpen(false)}
          onPick={(next) => {
            onChange(next)
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

/** Лист выбора категории и подкатегории из справочника. */
export function CategorySheet({
  tree,
  title = 'Категория из справочника',
  initialCategory = '',
  onClose,
  onPick,
}: {
  tree: CategoryNode[]
  title?: string
  initialCategory?: string
  onClose: () => void
  onPick: (next: { category: string; subcategory: string }) => void
}) {
  const [browseCategory, setBrowseCategory] = useState<string | null>(() => {
    const initial = initialCategory.trim() ? findCategoryNode(tree, initialCategory) : undefined
    return initial && initial.children.length > 0 ? initial.name : null
  })
  const node = browseCategory ? findCategoryNode(tree, browseCategory) : null

  function pickCategory(name: string) {
    const entry = findCategoryNode(tree, name)
    if (entry && entry.children.length > 0) {
      setBrowseCategory(name)
      return
    }
    onPick({ category: name, subcategory: '' })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet sheet-tall"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="row">
          <strong className="grow">{browseCategory ? browseCategory : title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="stack">
          {browseCategory ? (
            <>
              <button type="button" className="ghost crumb" onClick={() => setBrowseCategory(null)}>
                ← Все категории
              </button>
              <p className="muted">Выберите подкатегорию или оставьте только категорию</p>
              <div className="list">
                {node?.children.map((child) => (
                  <button
                    key={child}
                    type="button"
                    className="list-item"
                    onClick={() => onPick({ category: browseCategory, subcategory: child })}
                  >
                    <strong>{child}</strong>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => onPick({ category: browseCategory, subcategory: '' })}
              >
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
  )
}
