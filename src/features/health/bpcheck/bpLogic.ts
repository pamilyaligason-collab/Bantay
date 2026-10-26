import { localDay } from '../model'
import { PLAUSIBLE as P } from '../plausible'
import type { Reading } from '../ranges'
import { weekAverages } from '../vitals'

/** Pure logic of the guided two-reading blood pressure check (mockup health-bp / health-bpresult). */
export const REST_SECONDS = 60
export interface BpPair { top: number; bottom: number; pulse: number | null }

const whole = (s: string) => (s.trim() === '' ? NaN : Number(s))
/** The typed numbers as a pair, or the plain sentence to show when they cannot be a reading. Pulse is optional. */
export function parsePair(v: { top: string; bottom: string; pulse?: string }): BpPair | string {
  const top = whole(v.top)
  const bottom = whole(v.bottom)
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 'Type the top and the bottom number.'
  if (top < P.bp.min || top > P.bp.max || bottom < 20 || bottom > 200) return 'Check the numbers: they look too small or too big.'
  if (bottom >= top) return 'The top number is higher than the bottom one. Check them.'
  const p = (v.pulse ?? '').trim() === '' ? null : Number(v.pulse)
  if (p != null && (!Number.isFinite(p) || p < P.pulse.min || p > P.pulse.max)) return 'Check the pulse: it looks too small or too big.'
  return { top, bottom, pulse: p }
}

/** Today's number: the average of the two readings in whole numbers (138/86 and 130/82 make 134/84). The pulse averages only when both have one. */
export function averagePair(a: BpPair, b: BpPair): BpPair {
  return { top: Math.round((a.top + b.top) / 2), bottom: Math.round((a.bottom + b.bottom) / 2), pulse: a.pulse != null && b.pulse != null ? Math.round((a.pulse + b.pulse) / 2) : (a.pulse ?? b.pulse) }
}

export interface BpWeek { top: number; bottom: number; days: number; points: { day: string; top: number }[] }
/** The 7 days up to now: the average of every blood pressure reading (the number a doctor asks for), how many of the 7 days have one, and the daily average of the top number for the chart. Null when the week has none. */
export function bpWeek(readings: Reading[], now: Date): BpWeek | null {
  const avgs = weekAverages(readings.filter((r) => r.test === 'bp_systolic' || r.test === 'bp_diastolic'), now)
  const top = avgs.find((r) => r.test === 'bp_systolic')
  const bottom = avgs.find((r) => r.test === 'bp_diastolic')
  if (!top || !bottom) return null
  const per = new Map<string, number[]>()
  for (const r of readings) {
    const t = Date.parse(r.takenAt)
    if (r.test !== 'bp_systolic' || !Number.isFinite(t) || now.getTime() - t > 7 * 86_400_000 || t > now.getTime() + 86_400_000) continue
    const k = localDay(r.takenAt)
    per.set(k, [...(per.get(k) ?? []), r.value])
  }
  const points = [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, top: Math.round(v.reduce((s, n) => s + n, 0) / v.length) }))
  return { top: top.value, bottom: bottom.value, days: points.length, points }
}
