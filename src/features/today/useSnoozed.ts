import { useEffect, useState } from 'react'
import { isSnoozed, snoozedUntil, SNOOZE_EVENT } from './snoozeCard'

/** True while this slot's card is snoozed; flips back by itself when the time comes (and when the app returns to the front). */
export function useSnoozed(slotKey: string): boolean {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const sync = () => setNow(new Date())
    window.addEventListener(SNOOZE_EVENT, sync)
    document.addEventListener('visibilitychange', sync)
    return () => { window.removeEventListener(SNOOZE_EVENT, sync); document.removeEventListener('visibilitychange', sync) }
  }, [])
  const until = snoozedUntil(slotKey, now)
  useEffect(() => {
    if (until == null) return
    const t = setTimeout(() => setNow(new Date()), Math.max(0, until - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [until, now])
  return isSnoozed(slotKey, now)
}
