import { dayOf, matchDoses, slotsFor } from '../health/meds'
import { GUIDE, type Reading } from '../health/ranges'
import { BP_WORDS, bpLevel } from '../health/verdict'
import type { Activity, MedTaken, Medication } from '../log/store'

/** The 7 days the Family Activity chart draws, per person (pure; `now` is passed in, ML-32). Gaps are null, never 0. */
export const DAYS = 7
export type Metric = 'bp' | 'steps' | 'meds'
export interface Series { personId: string; points: (number | null)[]; latest: number | null; empty: boolean }

/** 7 local YYYY-MM-DD keys, oldest first, the last one today. */
export function dayKeys(now: Date): string[] {
  return Array.from({ length: DAYS }, (_, i) => dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i), 12)))
}

const finish = (personId: string, points: (number | null)[]): Series => {
  const latest = [...points].reverse().find((p) => p != null) ?? null
  return { personId, points, latest, empty: latest == null }
}

export function bpSeries(readings: Reading[], ids: string[], now: Date): Series[] {
  const keys = dayKeys(now)
  return ids.map((id) => finish(id, keys.map((k) => {
    const v = readings.filter((r) => r.personId === id && r.test === 'bp_systolic' && Number.isFinite(r.value) && dayOf(r.takenAt) === k).map((r) => r.value)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  })))
}

export function stepSeries(acts: Activity[], ids: string[], now: Date): Series[] {
  const keys = dayKeys(now)
  return ids.map((id) => finish(id, keys.map((k) => {
    const v = acts.filter((a) => a.personId === id && a.kind === 'steps' && typeof a.steps === 'number' && dayOf(a.startedAt) === k).map((a) => a.steps!)
    return v.length ? v.reduce((a, b) => a + b, 0) : null
  })))
}

/** Percent of the day's doses taken (taken / all slots); a day with no slots is null. Future days of today's slots count as pending, so today is low until the evening. */
export function doseSeries(meds: Medication[], takes: MedTaken[], ids: string[], now: Date): Series[] {
  const keys = dayKeys(now)
  return ids.map((id) => finish(id, keys.map((k) => {
    const d = matchDoses(slotsFor(meds, id, k), takes.filter((t) => t.personId === id), k)
    return d.length ? Math.round((d.filter((x) => x.state === 'taken').length / d.length) * 100) : null
  })))
}

/** The healthy band drawn behind the chart, from the general guide (never a literal). */
export const BAND: Record<Metric, [number, number] | null> = {
  bp: [90, GUIDE.bp_systolic?.high ?? 119],
  steps: null,
  meds: [80, 100]
}

/** The legend word after the name: "148 high", "3,120", "80%", or "no readings". */
export function legendWord(metric: Metric, s: Series): string {
  if (s.latest == null) return 'no readings'
  if (metric === 'steps') return s.latest.toLocaleString('en-US')
  if (metric === 'meds') return `${s.latest}%`
  const lv = bpLevel(s.latest, null)
  return `${s.latest} ${lv && lv !== 'in' ? BP_WORDS[lv].word.toLowerCase() : 'in range'}`
}
