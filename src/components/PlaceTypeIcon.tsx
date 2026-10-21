import type { ReactNode } from 'react'
import { PLACE_TYPE_LABEL } from '../data/placeTypes'
import type { PlaceType } from '../types'

const SHAPES: Record<PlaceType, ReactNode> = {
  // Дом
  object: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  // Дверь
  room: (
    <>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M3 21h18" />
      <path d="M14.5 12.5v.01" />
    </>
  ),
  // Стеллаж с тремя ярусами
  cabinet: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M4 9h16M4 15h16" />
    </>
  ),
  // Полка (планка), на ней два предмета
  shelf: (
    <>
      <path d="M2.5 18h19" />
      <rect x="5" y="6" width="4.5" height="12" rx="0.5" />
      <rect x="12" y="10.5" width="7" height="7.5" rx="0.5" />
    </>
  ),
  // Картонная коробка
  box: (
    <>
      <path d="M3 7.5 12 3.5l9 4v9l-9 4-9-4z" />
      <path d="M3 7.5l9 4 9-4M12 11.5v9" />
    </>
  ),
  // Контейнер с крышкой
  container: (
    <>
      <rect x="3" y="5" width="18" height="4" rx="1" />
      <path d="M5 9l1 11h12l1-11" />
      <path d="M10 13h4" />
    </>
  ),
  // Прочее
  other: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
}

/** Значок типа места (помещение, стеллаж, полка, коробка…) для беглого просмотра списков. */
export function PlaceTypeIcon({ type, decorative = false }: { type: PlaceType; decorative?: boolean }) {
  const label = PLACE_TYPE_LABEL[type]
  return (
    <svg
      className="place-type-icon"
      viewBox="0 0 24 24"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    >
      {decorative ? null : <title>{label}</title>}
      {SHAPES[type]}
    </svg>
  )
}
