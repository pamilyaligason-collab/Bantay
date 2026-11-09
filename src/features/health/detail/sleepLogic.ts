import { hasRealStart, localDay, monthlyAverages, sleepWakeDay, type Activity, type Point } from '../model'

/** Minutes as the hero prints them: "45 min", "6 h 02 min". The one formatter for every sleep figure on the page. */
export const hm = (min: number) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`)

/** Hours of sleep the adult guidance names (the same 7 to 9 the page prints). Children get no comparison. */
export const REC = { low: 7, high: 9 } as const
export const isAdult = (age: number | null): boolean => age != null && age >= 18

/** The recommended band for the chart: adults only. An unknown age is not assumed adult. */
export const sleepBand = (age: number | null): { low: number; high: number } | null => (isAdult(age) ? { low: REC.low, high: REC.high } : null)

/** One plain sentence against the 7 to 9 hours, or null (children, unknown age, no sleep recorded: nothing is said). */
export function sleepSentence(hours: number | null, age: number | null): string | null {
  if (hours == null || !Number.isFinite(hours) || !isAdult(age)) return null
  if (hours < REC.low) return `Shorter than the ${REC.low} to ${REC.high} hours recommended for adults.`
  if (hours > REC.high) return `Longer than the ${REC.low} to ${REC.high} hours recommended for adults.`
  return `Within the ${REC.low} to ${REC.high} hours recommended for adults.`
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
