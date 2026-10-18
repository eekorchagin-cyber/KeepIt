import { useEffect, useState } from 'react'

export type LongPressHint = { text: string; x: number; y: number; below: boolean }

const LONG_PRESS_MS = 450
const HINT_VISIBLE_MS = 1800
/** Палец сдвинулся дальше — это прокрутка, а не нажатие */
const MOVE_TOLERANCE_PX = 10
/** Значки с подписью действия (aria-label) */
const HINT_TARGET = 'button.icon-btn[aria-label]'

/**
 * Долгое нажатие на любой значок показывает подсказку словами (на телефоне нет наведения мыши).
 * Действие кнопки после долгого нажатия не выполняется.
 */
export function useLongPressHints(): LongPressHint | null {
  const [hint, setHint] = useState<LongPressHint | null>(null)

  useEffect(() => {
    let pressTimer: number | undefined
    let hideTimer: number | undefined
    let startX = 0
    let startY = 0
    let suppressClick = false

    function cancelPress() {
      window.clearTimeout(pressTimer)
      pressTimer = undefined
    }

    function onPointerDown(event: PointerEvent) {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(HINT_TARGET)
      cancelPress()
      suppressClick = false
      if (!button || button.disabled) return
      startX = event.clientX
      startY = event.clientY
      pressTimer = window.setTimeout(() => {
        pressTimer = undefined
        const rect = button.getBoundingClientRect()
        const below = rect.bottom + 60 < window.innerHeight
        suppressClick = true
        window.clearTimeout(hideTimer)
        setHint({
          text: button.getAttribute('aria-label') ?? '',
          x: rect.left + rect.width / 2,
          y: below ? rect.bottom + 6 : rect.top - 6,
          below,
        })
      }, LONG_PRESS_MS)
    }

    function onPointerMove(event: PointerEvent) {
      if (pressTimer === undefined) return
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX) cancelPress()
    }

    function onPointerEnd() {
      cancelPress()
      if (!suppressClick) return
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => setHint(null), HINT_VISIBLE_MS)
    }

    function onClick(event: MouseEvent) {
      if (!suppressClick) return
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }

    function onContextMenu(event: MouseEvent) {
      if ((event.target as Element | null)?.closest(HINT_TARGET)) event.preventDefault()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerEnd, true)
    document.addEventListener('pointercancel', onPointerEnd, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    return () => {
      cancelPress()
      window.clearTimeout(hideTimer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerEnd, true)
      document.removeEventListener('pointercancel', onPointerEnd, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [])

  return hint
}
