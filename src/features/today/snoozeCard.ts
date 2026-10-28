import { dayKey } from '../discover/play/score' // the local-day helper (ML-38)

/** "In 10 min" on the late dose card: the card hides until the time and then comes back. Kept per day and slot key in localStorage, so a reload does not bring it back early.
 *  The native alarm snooze is separate (reminderActions.handleReminderAction); this is only the card. */
export const SNOOZE_KEY = 'td.snooze'
export const SNOOZE_EVENT = 'td-snooze'
type Store = Record<string, number>

const read = (): Store => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {}
  } catch { return {} }
}

/** Hide the card for `minutes` from `now`. Returns the time it comes back (ms). Entries that already ended are dropped, so the store never grows. */
export function snoozeCard(slotKey: string, minutes = 10, now: Date = new Date()): number {
  const until = now.getTime() + minutes * 60_000
  const next: Store = {}
  for (const [k, v] of Object.entries(read())) if (Number.isFinite(v) && v > now.getTime()) next[k] = v
  next[`${dayKey(now)}|${slotKey}`] = until
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)) } catch { /* private window: the card stays hidden for this visit only */ }
  try { window.dispatchEvent(new Event(SNOOZE_EVENT)) } catch { /* no window */ }
  return until
}

/** When a snooze for this slot ends (ms), or null. Looks at today and yesterday, so a snooze set at 23:55 still holds at 00:05. */
export function snoozedUntil(slotKey: string, now: Date = new Date()): number | null {
  const s = read()
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
  const v = [dayKey(now), dayKey(y)].map((d) => s[`${d}|${slotKey}`]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? Math.max(...v) : null
}

export const isSnoozed = (slotKey: string, now: Date = new Date()): boolean => {
  const u = snoozedUntil(slotKey, now)
  return u != null && u > now.getTime()
}
