import { useEffect, useState } from 'react'
import { isSnoozed, snoozedUntil, SNOOZE_EVENT } from './snoozeCard'

/** The items whose snooze has not ended. Snooze hides only that slot's card, so the rest (another person's dose, the plan) stays. Re-checks when a snooze is set,
 *  when the app returns to the front, and exactly when the next snooze ends. */
export function useUnsnoozed<T>(items: T[], keyOf: (t: T) => string): T[] {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const sync = () => setNow(new Date())
    window.addEventListener(SNOOZE_EVENT, sync)
    document.addEventListener('visibilitychange', sync)
    return () => { window.removeEventListener(SNOOZE_EVENT, sync); document.removeEventListener('visibilitychange', sync) }
  }, [])
  const ends = items.map((t) => snoozedUntil(keyOf(t), now)).filter((u): u is number => u != null && u > now.getTime())
  const next = ends.length ? Math.min(...ends) : null
  useEffect(() => {
    if (next == null) return
    const t = setTimeout(() => setNow(new Date()), Math.max(0, next - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [next, now])
  return items.filter((t) => !isSnoozed(keyOf(t), now))
}
