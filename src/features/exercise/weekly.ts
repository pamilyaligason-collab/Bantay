import type { Activity } from '../health/model'
import { moveById } from './recommend'

/** WHO 2020 / CDC older adults: 150 minutes a week of moderate activity and muscle-strengthening or balance on 2 days. */
export const GOAL_MINUTES = 150
export const GOAL_DAYS = 2
export const EX_PREFIX = 'ex:'

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Minutes a move counts for: its time, or about 2 minutes for a counted set. */
export const minutesOf = (m: { durationSec?: number }) => (m.durationSec ? Math.max(1, Math.ceil(m.durationSec / 60)) : 2)

export interface WeekProgress { minutes: number; goalMinutes: number; strengthDays: number; goalDays: number; pct: number; doneIds: string[] }

/** The last 7 days from existing activity rows: walks and Move logs (kind 'ex:<moveId>') add minutes; a Move log of a strength or balance move adds its day.
 *  A row with unknown minutes (null) adds nothing. */
export function weekProgress(rows: Activity[], now = new Date()): WeekProgress {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  let minutes = 0
  const days = new Set<string>()
  const doneIds: string[] = []
  for (const r of rows) {
    if (r.startedAt < since || r.startedAt > now.toISOString()) continue
    const isEx = r.kind.startsWith(EX_PREFIX)
    if (!isEx && r.kind !== 'walk') continue
    if (typeof r.minutes === 'number' && Number.isFinite(r.minutes) && r.minutes > 0) minutes += r.minutes
    if (isEx) {
      const id = r.kind.slice(EX_PREFIX.length)
      doneIds.push(id)
      const g = moveById(id)?.group
      if (g === 'strength' || g === 'balance') days.add(localDay(new Date(r.startedAt)))
    }
  }
  const pct = Math.min(100, Math.round((minutes / GOAL_MINUTES) * 100))
  return { minutes, goalMinutes: GOAL_MINUTES, strengthDays: Math.min(days.size, GOAL_DAYS), goalDays: GOAL_DAYS, pct, doneIds }
}
