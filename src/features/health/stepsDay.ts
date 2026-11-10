import { localDay, stepDayTotals } from './model'
import type { Activity } from './model'

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const DATE = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' })

/** Steps of the newest local day that has any: `today` is false when that day is earlier, with its short weekday ("Mon"). null when no steps at all (never 0 from no data). */
export function latestSteps(acts: Activity[], now = new Date()): { total: number; today: boolean; day: string } | null {
  const days = stepDayTotals(acts)
  const newest = [...days.keys()].sort().pop()
  if (!newest) return null
  const today = newest === localDay(now.toISOString())
  return { total: days.get(newest)!, today, day: today ? 'Today' : (now.getTime() - new Date(`${newest}T12:00:00`).getTime() < 6 * 86_400_000 ? WEEKDAY : DATE).format(new Date(`${newest}T12:00:00`)) } // a weekday only within the week, else the date
}
