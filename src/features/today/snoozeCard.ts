import { manilaDay } from '../health/meds' // the dose day is Manila's (ML-38)
import { addManilaDays } from './nextPick'

/** "In 10 min" on the late dose card: the card hides until the time and then comes back. Kept per day and slot key in localStorage, so a reload does not bring it back early.
 *  The native alarm snooze is separate (reminderActions.handleReminderAction); this is only the card. */
export const SNOOZE_KEY = 'td.snooze'
export const SNOOZE_EVENT = 'td-snooze'
/** A dose card can be snoozed 3 times a day, the same number as the rings in reminders.ts (D-148). After that the card stays and says the dose is still due. */
export const SNOOZE_MAX = 3
const COUNT_KEY = 'td.snooze.n'
type Store = Record<string, number>

const read = (key = SNOOZE_KEY): Store => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {}
  } catch { return {} }
}

/** Hide the card for `minutes` from `now`. Returns the time it comes back (ms). Entries that already ended are dropped, so the store never grows. */
/** `day` is the dose's own Manila day (doseDay), so a 23:30 dose snoozed past midnight still counts toward the same 3; it defaults to the day of `now`. */
export function snoozeCard(slotKey: string, minutes = 10, now: Date = new Date(), day: string = manilaDay(now)): number {
  const until = now.getTime() + minutes * 60_000
  const next: Store = {}
  for (const [k, v] of Object.entries(read())) if (Number.isFinite(v) && v > now.getTime()) next[k] = v
  const today = manilaDay(now)
  const oldest = addManilaDays(today, -1) // a dose can belong to yesterday
  const counts: Store = {}
  for (const [k, v] of Object.entries(read(COUNT_KEY))) if (k.slice(0, 10) >= oldest && Number.isFinite(v)) counts[k] = v // older days are dropped
  counts[`${day}|${slotKey}`] = (counts[`${day}|${slotKey}`] ?? 0) + 1
  try { localStorage.setItem(COUNT_KEY, JSON.stringify(counts)) } catch { /* private window: no cap this visit */ }
  next[`${today}|${slotKey}`] = until
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)) } catch { /* private window: the card stays hidden for this visit only */ }
  try { window.dispatchEvent(new Event(SNOOZE_EVENT)) } catch { /* no window */ }
  return until
}

/** When a snooze for this slot ends (ms), or null. Looks at today and yesterday, so a snooze set at 23:55 still holds at 00:05. */
export function snoozedUntil(slotKey: string, now: Date = new Date()): number | null {
  const s = read()
  const v = [manilaDay(now), manilaDay(new Date(now.getTime() - 86_400_000))].map((d) => s[`${d}|${slotKey}`]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? Math.max(...v) : null
}

export const isSnoozed = (slotKey: string, now: Date = new Date()): boolean => {
  const u = snoozedUntil(slotKey, now)
  return u != null && u > now.getTime()
}

/** How many times this dose card was snoozed on the dose's day (Manila; `day` defaults to today). */
export const snoozeCount = (slotKey: string, now: Date = new Date(), day: string = manilaDay(now)): number => read(COUNT_KEY)[`${day}|${slotKey}`] ?? 0

export const canSnooze = (slotKey: string, now: Date = new Date(), day: string = manilaDay(now)): boolean => snoozeCount(slotKey, now, day) < SNOOZE_MAX
