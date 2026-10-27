import { countDoses } from '../health/doseCount'
import { dayOf } from '../health/meds'
import type { Reading } from '../health/ranges'
import type { MedTaken, Medication } from '../log/store'
import { lastDays } from '../today/myWeekLogic'

/** The Sunday recap, from the member's OWN week (the 7 local days ending `now`). Pure.
 *  avg: the average top and bottom of every BP reading in the week, null when there is none (never 0).
 *  checks: days with a BP reading before noon, of 7. medDays: days when every dose due was taken, of the days that had a dose due (null when no medicine has a time).
 *  What may be shared is `recapShareText`: counts only, never a reading. */
export interface Recap {
  avg: { sys: number; dia: number } | null
  checks: { done: number; of: number }
  medDays: { done: number; of: number } | null
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

export function recap(i: { personId: string; readings: Reading[]; meds: Medication[]; takes: MedTaken[]; now: Date }): Recap {
  const days = lastDays(i.now)
  const inWeek = (iso: string) => days.includes(dayOf(iso))
  const mine = i.readings.filter((r) => r.personId === i.personId && num(r.value) && inWeek(r.takenAt))
  const top = mine.filter((r) => r.test === 'bp_systolic')
  const bottom = mine.filter((r) => r.test === 'bp_diastolic')
  const morning = new Set(top.concat(bottom).filter((r) => new Date(r.takenAt).getHours() < 12).map((r) => dayOf(r.takenAt)))
  let want = 0
  let done = 0
  for (const d of days) {
    const c = countDoses({ meds: i.meds, takes: i.takes, personId: i.personId, now: i.now, days: [d] })
    if (c.want === 0) continue
    want++
    if (c.done === c.want) done++
  }
  return {
    avg: top.length && bottom.length ? { sys: mean(top.map((r) => r.value)), dia: mean(bottom.map((r) => r.value)) } : null,
    checks: { done: morning.size, of: days.length },
    medDays: want ? { done, of: want } : null
  }
}

/** Anything worth sharing? A week with no checks and no medicine days says nothing, so the Share button stays off. */
export const hasSomethingToShare = (r: Recap) => r.checks.done > 0 || (r.medDays?.done ?? 0) > 0

/** The family line: counts only. No average, no reading, no name (the thread shows who sent it). Always under the server's 200 characters and never a "128/82" shape. */
export function recapShareText(r: Recap): string {
  const parts = [`${r.checks.done} of ${r.checks.of} morning checks`]
  if (r.medDays) parts.push(`medicines on ${r.medDays.done} of ${r.medDays.of} days`)
  return `This week: ${parts.join(', ')}.`
}
