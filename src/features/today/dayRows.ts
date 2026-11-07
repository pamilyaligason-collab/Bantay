import type { Reading } from '../health/ranges'
import { ML_PER_TAP, dayKey, onDay } from '../nutrition/logic'
import { goalGlasses } from '../nutrition/waterGoal'
import { BAT_LOW, isEvening } from './batteryReminder'
import type { Battery } from './useBattery'

type Row = { title: string; sub: string; done: boolean }
const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString()

/** Weekly blood pressure: done when a reading landed in the last 7 days. */
export function bpRow(readings: Pick<Reading, 'test' | 'value' | 'takenAt'>[], now: Date): Row & { href: string } {
  const href = '#health/metric/bp_systolic'
  const from = now.getTime() - 7 * 86_400_000
  const sys = readings.filter((r) => r.test === 'bp_systolic' && Date.parse(r.takenAt) >= from).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]
  if (!sys) return { title: 'Blood pressure', sub: 'Weekly · none this week', done: false, href }
  const dia = readings.find((r) => r.test === 'bp_diastolic' && r.takenAt === sys.takenAt)
  const day = new Date(sys.takenAt).toLocaleDateString('en-PH', { weekday: 'short' })
  return { title: 'Blood pressure', sub: `Last ${sys.value}${dia ? `/${dia.value}` : ''} · ${day}`, done: true, href }
}

/** Water is done at the goal, not per glass; `frac` (0..1) lets each glass still move the ring. */
export function waterRow(rows: { drunkAt: string; ml: number }[], goalMl: number, now: Date, source?: string): Row & { frac: number } {
  const glasses = Math.round(onDay(rows, now).reduce((s, r) => s + r.ml, 0) / ML_PER_TAP)
  const goal = goalGlasses(goalMl, source)
  return { title: 'Water', sub: `${glasses} of ${goal} glasses${source === 'limit' ? " · Your doctor's limit" : ''}`, done: glasses >= goal, frac: Math.min(1, glasses / goal) }
}

export const checkInRow = (activity: { kind: string; startedAt: string }[], now: Date, signedIn = true): Row =>
  ({ title: 'How are you?', sub: signedIn ? 'Lets the family know you are fine' : 'Sign in to let the family know', done: activity.some((a) => a.kind === 'check-in' && sameDay(a.startedAt, now)) })

/** S22 extra: from 19:00 local a phone under 30 % gets a "Charge your phone" row, done once it charges. Unknown level (null) or 30 % and over: no row. */
export function batteryRow(b: Battery | null, now: Date): Row | null {
  if (!b || !isEvening(now) || b.level >= BAT_LOW) return null
  return { title: 'Charge your phone', sub: `${Math.round(b.level * 100)}% · so the family can reach you tonight`, done: b.charging }
}

export function countLeft(rows: { done: boolean }[]) {
  const left = rows.filter((r) => !r.done).length
  return { left, total: rows.length, title: left === 0 ? 'All done for today' : `${left} thing${left === 1 ? '' : 's'} left today` }
}

/** S22 rewards: the fixed priority order and their number badges (1-3). Anything else (missed medicine, breath, plan) follows. */
export type PriKey = 'bp' | 'water' | 'checkin'
export const PRIORITY: PriKey[] = ['bp', 'water', 'checkin']

/** The ring counts the goal-reaching rows, plus the share of the water goal reached so far, so each glass moves it. */
export const ringValue = (done: number, total: number, waterDone: boolean, waterFrac: number) => (total ? (done + (waterDone ? 0 : waterFrac)) / total : 0)

const SEEN_KEY = 'bantay.myday.doneCard'
const seenVal = (now: Date, personId: string) => `${dayKey(now)}|${personId}`
/** The congratulations card shows once per local day per person; the day is remembered on this device only. */
export function doneCardSeen(now: Date, personId: string): boolean {
  try { return localStorage.getItem(SEEN_KEY) === seenVal(now, personId) } catch { return false }
}
export function markDoneCardSeen(now: Date, personId: string): void {
  try { localStorage.setItem(SEEN_KEY, seenVal(now, personId)) } catch { /* private mode: the card may show again on a later transition */ }
}

const PEND_KEY = 'bantay.myday.pending'
/** A remount on the same day must tell "finished while away" from "done on arrival": the day a priority was last seen open is remembered on this device (per person). */
export function prioPendingSeen(now: Date, personId: string): boolean {
  try { return localStorage.getItem(PEND_KEY) === seenVal(now, personId) } catch { return false }
}
export function markPrioPending(now: Date, personId: string): void {
  try { localStorage.setItem(PEND_KEY, seenVal(now, personId)) } catch { /* private mode: a finish while away shows no card */ }
}

/** "1 extra left: evening medicine at 8 PM": names the first extra that has a time of its own; generic when none has. */
export const extraLine = (n: number, named?: { title: string; time: string }) => `${n} extra${n === 1 ? '' : 's'} left${named ? `: ${named.title}${named.time ? ` at ${named.time}` : ''}` : ''}`
