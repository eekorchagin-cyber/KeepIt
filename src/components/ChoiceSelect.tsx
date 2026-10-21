import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type ChoiceOption<T extends string | number> = {
  value: T
  label: string
  /** Пояснение мелким шрифтом под вариантом */
  hint?: string
  /** Заголовок группы, под которым показывается вариант */
  group?: string
  /** Значок слева от названия */
  icon?: ReactNode
}

/**
 * Выбор из списка в стиле программы вместо системного (на iPhone — чёрного) окна:
 * поле со значением и «›», по нажатию — светлое окно снизу со списком вариантов.
 */
export function ChoiceSelect<T extends string | number>({
  value,
  options,
  onChange,
  title,
  ariaLabel,
  placeholder = 'Выберите',
  compact = false,
  disabled = false,
  renderTrigger,
}: {
  value: T
  options: ChoiceOption<T>[]
  onChange: (value: T) => void
  /** Заголовок окна выбора */
  title: string
  ariaLabel?: string
  placeholder?: string
  /** Узкое поле (например, единица в строке импорта) */
  compact?: boolean
  disabled?: boolean
  /** Своя кнопка вместо поля (например, значок) — получает функцию открытия списка */
  renderTrigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.value === value)

  const groups: Array<{ name: string; items: ChoiceOption<T>[] }> = []
  for (const option of options) {
    const name = option.group ?? ''
    const group = groups.find((entry) => entry.name === name)
    if (group) group.items.push(option)
    else groups.push({ name, items: [option] })
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          className={`field-trigger choice-trigger${compact ? ' compact' : ''}`}
          aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? placeholder}` : undefined}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <span className={current ? undefined : 'muted'}>{current?.label ?? placeholder}</span>
          <span className="muted" aria-hidden>
            ›
          </span>
        </button>
      )}

      {open
        ? createPortal(
            <div className="sheet-backdrop" onClick={() => setOpen(false)} role="presentation">
              <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
                <div className="row">
                  <strong className="grow">{title}</strong>
                  <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Закрыть">
                    ×
                  </button>
                </div>
                <div className="stack choice-list">
                  {groups.map((group) => (
                    <div key={group.name || 'all'} className="stack">
                      {group.name ? <span className="muted choice-group">{group.name}</span> : null}
                      <div className="list">
                        {group.items.map((option) => {
                          const selected = option.value === value
                          return (
                            <button
                              key={String(option.value)}
                              type="button"
                              className={`list-item choice-option${selected ? ' selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() => {
                                setOpen(false)
                                if (!selected) onChange(option.value)
                              }}
                            >
                              {option.icon ? <span className="choice-icon">{option.icon}</span> : null}
                              <span className="stack-tight">
                                <strong>{option.label}</strong>
                                {option.hint ? <span className="muted">{option.hint}</span> : null}
                              </span>
                              <span className="choice-check" aria-hidden>
                                {selected ? '✓' : ''}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
