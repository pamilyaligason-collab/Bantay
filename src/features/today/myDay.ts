import type { Reading } from '../health/ranges'
import { ML_PER_TAP, onDay } from '../nutrition/logic'

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

export function waterRow(rows: { drunkAt: string; ml: number }[], goalMl: number, now: Date): Row {
  const glasses = Math.round(onDay(rows, now).reduce((s, r) => s + r.ml, 0) / ML_PER_TAP)
  return { title: 'Water', sub: `${glasses} of ${Math.max(1, Math.round(goalMl / ML_PER_TAP))} glasses`, done: false }
}

export const checkInRow = (activity: { kind: string; startedAt: string }[], now: Date): Row =>
  ({ title: 'How are you?', sub: 'Lets the family know you are fine', done: activity.some((a) => a.kind === 'check-in' && sameDay(a.startedAt, now)) })

export function countLeft(rows: { done: boolean }[]) {
  const left = rows.filter((r) => !r.done).length
  return { left, total: rows.length, title: left === 0 ? 'All done for today' : `${left} thing${left === 1 ? '' : 's'} left today` }
}
