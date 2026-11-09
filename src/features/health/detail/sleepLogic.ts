import { localDay, monthlyAverages, type Activity, type Point } from '../model'

/** Hours of sleep the adult guidance names (the same 7 to 9 the page prints). Children get no comparison. */
export const REC = { low: 7, high: 9 } as const
export const isAdult = (age: number | null): boolean => age != null && age >= 18

/** The recommended band for the chart: adults only. An unknown age is not assumed adult. */
export const sleepBand = (age: number | null): { low: number; high: number } | null => (isAdult(age) ? { low: REC.low, high: REC.high } : null)

/** One plain sentence against the 7 to 9 hours, or null (children, unknown age, no sleep recorded: nothing is said). */
export function sleepSentence(hours: number | null, age: number | null): string | null {
  if (hours == null || !Number.isFinite(hours) || !isAdult(age)) return null
  if (hours < REC.low) return `Shorter than the ${REC.low} to ${REC.high} hours adults need.`
  if (hours > REC.high) return `Longer than the ${REC.low} to ${REC.high} hours adults need.`
  return `Within the ${REC.low} to ${REC.high} hours adults need.`
}

export interface Night { day: string; minutes: number; napMinutes: number; bedAt: string }
const HOUR = 3_600_000

/** The latest night on file (never later than today). A row that starts between 9:00 and 17:59 is a nap; any other row belongs to the night that ends on the day 6 hours after it starts,
 *  so 23:00 and 01:54 starts both land on the morning they woke. Bed time is the earliest start. The phone stores a start and the minutes asleep, not a wake time, so none is shown. */
export function lastNight(acts: Activity[], now: Date): Night | null {
  const today = localDay(now.toISOString())
  const nights = new Map<string, { minutes: number; bedAt: string }>()
  const naps = new Map<string, number>()
  for (const a of acts) {
    if (a.kind !== 'sleep' || typeof a.minutes !== 'number' || !(a.minutes > 0) || Number.isNaN(Date.parse(a.startedAt))) continue
    const t = Date.parse(a.startedAt)
    const h = new Date(t).getHours()
    if (h >= 9 && h < 18) { const k = localDay(a.startedAt); naps.set(k, (naps.get(k) ?? 0) + a.minutes); continue }
    const k = localDay(new Date(t + 6 * HOUR).toISOString())
    const cur = nights.get(k)
    nights.set(k, { minutes: (cur?.minutes ?? 0) + a.minutes, bedAt: cur && Date.parse(cur.bedAt) < t ? cur.bedAt : a.startedAt })
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
