import { formatNumber } from '../../lib/labFormat'
import { dayOf } from './meds'
import { activitySeries, type Activity } from './model'
import { GUIDE, type Reading } from './ranges'
import { lastDays } from '../today/myWeekLogic'

/** Pure series helpers for the Today tiles and the vital detail heroes. A day with no data is null, never 0 (ML-05). */
export type Series = (number | null)[]

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Mean of the readings of one test on each of the last `n` local days (oldest first). */
export function dailyMean(rows: Reading[], test: string, now: Date, n = 7): Series {
  const days = lastDays(now, n)
  const by = new Map<string, number[]>()
  for (const r of rows) {
    if (r.test !== test || !isNum(r.value)) continue
    const d = dayOf(r.takenAt)
    if (d) by.set(d, [...(by.get(d) ?? []), r.value])
  }
  return days.map((d) => { const v = by.get(d); return v?.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null })
}

/** Entries per local day (glasses of water). */
export function dailyCount(stamps: string[], now: Date, n = 7): Series {
  const days = lastDays(now, n)
  const by = new Map<string, number>()
  for (const s of stamps) { const d = dayOf(s); if (d) by.set(d, (by.get(d) ?? 0) + 1) }
  return days.map((d) => by.get(d) ?? null)
}

/** Steps or hours of sleep per local day. */
export function dailyActivity(acts: Activity[], code: 'steps' | 'sleep', now: Date, n = 7): Series {
  const by = new Map(activitySeries(acts, code).map((p) => [p.takenAt.slice(0, 10), p.value]))
  return lastDays(now, n).map((d) => by.get(d) ?? null)
}

export const present = (s: Series): number[] => s.filter(isNum)
/** Mean of the days that have data; null when none. */
export const seriesMean = (s: Series): number | null => { const v = present(s); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

const org = (source: string) => source.split(',')[0]! // 'AHA, Understanding ...' -> 'AHA'; the full source stays in 'Where the range comes from'
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/** One plain line for the hero of a vital: the 7-day average and the general guide that is already in the app (never a diagnosis). null when there is no data. */
export function vitalSummary(code: 'bp' | 'pulse', top: Series, bottom: Series = []): string | null {
  const t = seriesMean(top)
  if (t == null) return null
  const n = present(top).length
  const b = seriesMean(bottom)
  if (code === 'bp') {
    const g = GUIDE.bp_systolic, gd = GUIDE.bp_diastolic
    const guide = g && gd ? ` General guide for adults: ${g.text.toLowerCase()} on top, ${gd.text.toLowerCase()} on the bottom (${org(g.source)}, ${g.year}).` : ''
    return `Average over the last 7 days: ${Math.round(t)}${b != null ? `/${Math.round(b)}` : ''} mmHg, from ${days(n)} with a reading.${guide}`
  }
  const g = GUIDE.heart_rate
  return `Average over the last 7 days: ${Math.round(t)} beats a minute, from ${days(n)} with a reading.${g ? ` General guide for a resting pulse in adults: ${g.text} beats a minute (${org(g.source)}, ${g.year}).` : ''}`
}

/** Water: the 7-day average on the days something was logged, against the goal when there is one. */
export function waterSummary(glasses: Series, goal: number | null): string | null {
  const m = seriesMean(glasses)
  if (m == null) return null
  const n = present(glasses).length
  return `Average over the last 7 days: ${formatNumber(Math.round(m * 10) / 10)} ${Math.round(m * 10) / 10 === 1 ? 'glass' : 'glasses'} a day, from ${days(n)} with a drink logged.${goal != null ? ` Today's goal is ${goal}.` : ''}`
}

export const WATER_TIP = 'Sip through the day instead of all at once. If your doctor has limited your fluids, follow that limit.'

/** Sleep: the 7-night average hours (the day totals already join a nap to its night). */
export function sleepAverage(hours: Series): { text: string; nights: number } | null {
  const m = seriesMean(hours)
  if (m == null) return null
  const n = present(hours).length
  const min = Math.round(m * 60)
  return { text: `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`, nights: n }
}
