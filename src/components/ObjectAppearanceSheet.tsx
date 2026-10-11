import { useState } from 'react'
import {
  OBJECT_BG_OPTIONS,
  OBJECT_ICON_OPTIONS,
  type ObjectIconId,
} from '../data/icons'
import type { Place } from '../types'

export function ObjectAppearanceSheet({
  title,
  initialName,
  initialIconId,
  initialIconBg,
  nameEditable = true,
  confirmLabel = 'Сохранить',
  busy = false,
  onClose,
  onSave,
}: {
  title: string
  initialName: string
  initialIconId: ObjectIconId
  initialIconBg: string
  nameEditable?: boolean
  confirmLabel?: string
  busy?: boolean
  onClose: () => void
  onSave: (next: { name: string; iconId: ObjectIconId; iconBg: string }) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [iconId, setIconId] = useState<ObjectIconId>(initialIconId)
  const [iconBg, setIconBg] = useState(initialIconBg)
  const [error, setError] = useState<string | null>(null)
  const preview = OBJECT_ICON_OPTIONS.find((option) => option.id === iconId) ?? OBJECT_ICON_OPTIONS[0]!

  async function submit() {
    setError(null)
    try {
      await onSave({ name, iconId, iconBg })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet sheet-tall" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
        <div className="row">
          <strong className="grow">{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="stack">
          <div className="object-preview">
            <span className="object-badge object-badge-lg" style={{ background: iconBg }}>
              <img src={preview.src} alt="" />
            </span>
            <strong>{name.trim() || 'Без названия'}</strong>
          </div>

          {nameEditable ? (
            <label className="field">
              Название
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Квартира в Химках"
                autoFocus
              />
            </label>
          ) : null}

          <div className="stack">
            <strong>Рисунок</strong>
            <div className="icon-picker">
              {OBJECT_ICON_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`icon-pick${iconId === option.id ? ' active' : ''}`}
                  style={{ background: iconBg }}
                  aria-label={option.label}
                  aria-pressed={iconId === option.id}
                  onClick={() => setIconId(option.id)}
                >
                  <img src={option.src} alt="" />
                </button>
              ))}
            </div>
          </div>

          <div className="stack">
            <strong>Фон</strong>
            <div className="bg-picker">
              {OBJECT_BG_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`bg-pick${iconBg === color ? ' active' : ''}`}
                  style={{ background: color }}
                  aria-label={`Фон ${color}`}
                  aria-pressed={iconBg === color}
                  onClick={() => setIconBg(color)}
                />
              ))}
            </div>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <button type="button" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {confirmLabel}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

export function appearanceFromPlace(place: Place): { iconId: ObjectIconId; iconBg: string } {
  const iconId = (OBJECT_ICON_OPTIONS.find((option) => option.id === place.iconId)?.id ??
    'apartment') as ObjectIconId
  return {
    iconId,
    iconBg: place.iconBg || OBJECT_BG_OPTIONS[0]!,
  }
}
