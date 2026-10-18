import { useEffect } from 'react'
import type { KeepItState } from './useKeepIt'
import { dueServiceItems, formatIsoDate, serviceDueLabel, todayIso } from '../data/service'
import { notifyServiceDue } from '../data/updateNotifications'

/** При открытии программы и возвращении в неё — системное уведомление о срочных ТО (раз в день). */
export function useServiceReminders(state: KeepItState) {
  const due = state.loading ? [] : dueServiceItems(state.serviceItems())
  const payload = JSON.stringify(
    due.map((item) => ({
      name: item.name,
      label: `${formatIsoDate(item.serviceNextAt)}, ${serviceDueLabel(item)}`,
    })),
  )

  useEffect(() => {
    const entries = JSON.parse(payload) as Array<{ name: string; label: string }>
    if (entries.length === 0) return
    const run = () => {
      if (document.visibilityState === 'visible') void notifyServiceDue(entries, todayIso())
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [payload])
}
