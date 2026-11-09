import { hasRealStart, localDay, monthlyAverages, sleepWakeDay, type Activity, type Point } from '../model'

/** Minutes as the hero prints them: "45 min", "6 h 02 min". The one formatter for every sleep figure on the page. */
export const hm = (min: number) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`)

/** Recommended sleep by age (CDC, National Sleep Foundation): 18 to 64 years 7 to 9 hours, 65 and older 7 to 8. Under 18 or an unknown age: no comparison (an unknown age is not assumed adult).
 *  The one source for the sentence, the chart band and the YearBars caption. */
export interface SleepBand { low: number; high: number; who: string }
export function sleepBand(age: number | null): SleepBand | null {
  if (age == null || !Number.isFinite(age) || age < 18) return null
  return age >= 65 ? { low: 7, high: 8, who: 'adults 65 and older' } : { low: 7, high: 9, who: 'adults' }
}

/** One plain sentence against the band for this age, or null (children, unknown age, no sleep recorded: nothing is said). */
export function sleepSentence(hours: number | null, age: number | null): string | null {
  const b = sleepBand(age)
  if (hours == null || !Number.isFinite(hours) || !b) return null
  const rec = `the ${b.low} to ${b.high} hours recommended for ${b.who}.`
  return hours < b.low ? `Shorter than ${rec}` : hours > b.high ? `Longer than ${rec}` : `Within ${rec}`
}

export interface Night { day: string; minutes: number; napMinutes: number; bedAt: string | null }

/** The latest night on file (never later than today), grouped by wake day (see sleepWakeDay). Bed time is the earliest start among rows that carry a real start; a night made only of manual rows has none (null),
 *  because those rows store when they were logged. The phone stores a start and the minutes asleep, not a wake time, so none is shown. */
export function lastNight(acts: Activity[], now: Date): Night | null {
  const today = localDay(now.toISOString())
  const nights = new Map<string, { minutes: number; bedAt: string | null }>()
  const naps = new Map<string, number>()
  for (const a of acts) {
    if (a.kind !== 'sleep' || typeof a.minutes !== 'number' || !(a.minutes > 0) || Number.isNaN(Date.parse(a.startedAt))) continue
    const { day, nap } = sleepWakeDay(a)
    if (nap) { naps.set(day, (naps.get(day) ?? 0) + a.minutes); continue }
    const cur = nights.get(day) ?? { minutes: 0, bedAt: null }
    cur.minutes += a.minutes
    if (hasRealStart(a) && (cur.bedAt == null || Date.parse(a.startedAt) < Date.parse(cur.bedAt))) cur.bedAt = a.startedAt
    nights.set(day, cur)
  }
  const day = [...nights.keys()].filter((k) => k <= today).sort().pop()
  return day ? { day, minutes: nights.get(day)!.minutes, napMinutes: naps.get(day) ?? 0, bedAt: nights.get(day)!.bedAt } : null
}

/** The 12 months ending this month, oldest first; avg is null for a month with no points (a gap, never 0). */
export function yearBars(pts: Point[], now: Date): { month: string; label: string; avg: number | null }[] {
  const have = new Map(monthlyAverages(pts, now, 12).map((m) => [m.month, m.avg]))
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { month, label: d.toLocaleDateString('en-US', { month: 'short' }), avg: have.get(month) ?? null }
  })
}
