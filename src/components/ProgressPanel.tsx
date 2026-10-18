import { useEffect, useState } from 'react'

function formatRemaining(seconds: number): string {
  if (seconds < 1) return 'меньше секунды'
  if (seconds < 60) return `≈ ${Math.ceil(seconds)} с`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.ceil(seconds % 60)
  return rest > 0 ? `≈ ${minutes} мин ${rest} с` : `≈ ${minutes} мин`
}

/** Шкала выполнения: проценты и оценка оставшегося времени по средней скорости. */
export function ProgressPanel({
  title,
  done,
  total,
  startedAt,
  finishing = false,
}: {
  title: string
  done: number
  total: number
  /** performance.now() в момент начала работы */
  startedAt: number
  /** Основная работа завершена, идёт обновление экрана */
  finishing?: boolean
}) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const elapsed = (now - startedAt) / 1000
  const remaining = done > 0 && done < total ? (elapsed / done) * (total - done) : null

  let detail = 'Подготовка…'
  if (finishing) detail = 'Обновление списков…'
  else if (remaining !== null && elapsed >= 1) detail = `Осталось ${formatRemaining(remaining)}`
  else if (done > 0) detail = 'Оценка времени…'

  return (
    <div className="panel stack" role="status" aria-live="polite">
      <strong>{title}</strong>
      <progress className="progress-bar" max={100} value={finishing ? 100 : percent} />
      <div className="row">
        <strong className="grow">{finishing ? 100 : percent}%</strong>
        <span className="muted">{detail}</span>
      </div>
      <p className="muted">Не закрывайте приложение до завершения.</p>
    </div>
  )
}
