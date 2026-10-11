import { objectIconSrc, resolveIconBg } from '../data/icons'
import type { Place } from '../types'

export function ObjectBadge({
  place,
  objectKey,
  size = 'md',
  className = '',
}: {
  place?: Place
  objectKey?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const bg = resolveIconBg(place, objectKey ?? place?.objectKey)
  const src = objectIconSrc(place, objectKey ?? place?.objectKey)
  return (
    <span
      className={`object-badge object-badge-${size}${className ? ` ${className}` : ''}`}
      style={{ background: bg }}
      aria-hidden
    >
      <img src={src} alt="" />
    </span>
  )
}
