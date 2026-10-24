import { useLayoutEffect, useRef } from 'react'

/**
 * Однострочное по смыслу поле (название), которое растёт по высоте, чтобы длинный текст был виден целиком.
 * Переводы строк не допускаются: Enter закрывает клавиатуру.
 */
export function AutoGrowInput({
  value,
  onChange,
  onBlur,
  autoFocus,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  autoFocus?: boolean
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      className={`auto-grow${className ? ` ${className}` : ''}`}
      rows={1}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      autoComplete="off"
      enterKeyHint="done"
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}
