/**
 * Открыть внешнюю ссылку (Safari / вкладка).
 * Не использовать window.open(url, '_blank', 'noopener,…'): на iPhone это часто
 * создаёт промежуточный about:blank, и кнопка «← KeepIt» возвращает на пустую страницу
 * — закрыть можно только крестиком. Открываем URL сразу и обнуляем opener отдельно.
 */
export function openExternalUrl(url: string): void {
  const win = window.open(url, '_blank')
  if (win) {
    try {
      win.opener = null
    } catch {
      /* ignore */
    }
    return
  }
  // Если всплывающие окна заблокированы — уходим в том же окне
  window.location.assign(url)
}
