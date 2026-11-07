/**
 * Открыть внешнюю ссылку.
 *
 * На iPhone/iPad нельзя использовать window.open / target=_blank из PWA и Safari:
 * появляется отдельное окно с историей, и «← KeepIt» сначала показывает пустую страницу —
 * в программу возвращает только крестик. Обычный переход (location.assign) открывает Google
 * в Safari, а стрелка «← KeepIt» сразу возвращает в KeepIt.
 */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function openExternalUrl(url: string): void {
  if (isAppleTouchDevice()) {
    window.location.assign(url)
    return
  }
  const win = window.open(url, '_blank')
  if (win) {
    try {
      win.opener = null
    } catch {
      /* ignore */
    }
    return
  }
  window.location.assign(url)
}
