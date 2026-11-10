import { lastNight, monthlyAverages, type Night, type Point } from '../model'

export { lastNight, type Night }

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

/** The 12 months ending this month, oldest first; avg is null for a month with no points (a gap, never 0). */
export function yearBars(pts: Point[], now: Date): { month: string; label: string; avg: number | null }[] {
  const have = new Map(monthlyAverages(pts, now, 12).map((m) => [m.month, m.avg]))
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { month, label: d.toLocaleDateString('en-US', { month: 'short' }), avg: have.get(month) ?? null }
  })
}
