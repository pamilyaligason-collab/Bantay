import { formatNumber } from '../../lib/labFormat'
import { hoursMinutes, localDay, readingPosition, bodyNodes, type Activity, type NodeView } from './model'
import { position, type Position, type Range, type Reading } from './ranges'

/** Vitals vs labs, 7-day averages and the "Normal" explanations for the Health overview. Pure. */
export const VITAL_TESTS = ['bp_systolic', 'bp_diastolic', 'fasting_glucose', 'glucose', 'heart_rate', 'weight', 'spo2', 'temperature']
export const isVital = (test: string) => VITAL_TESTS.includes(test)
/** Resting pulse for adults (PART-3 5.1). The app's guide file has none, so it lives here. */
export const PULSE_RANGE: Range = { low: 60, high: 100 }
const DAY = 86_400_000
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const avg = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
const r1 = (n: number) => Math.round(n * 10) / 10

/** A reading judged like the rest, with a resting pulse range added. */
export function positionOf(r: Reading, family?: Range | null): Position {
  const p = readingPosition(r, family)
  return p === 'none' && r.test === 'heart_rate' ? position(r.value, PULSE_RANGE) : p
}

/** One synthetic reading per test: the average of the last 7 days (the newest reading's time, unit and lab range). Tests with nothing in the week are left out. */
export function weekAverages(readings: Reading[], now: Date): Reading[] {
  const by = new Map<string, Reading[]>()
  for (const r of readings) {
    const t = Date.parse(r.takenAt)
    if (!isNum(r.value) || !Number.isFinite(t) || now.getTime() - t > 7 * DAY || t > now.getTime() + DAY) continue
    by.set(r.test, [...(by.get(r.test) ?? []), r])
  }
  return [...by.entries()].map(([test, rs]) => {
    const newest = [...rs].sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]!
    return { ...newest, test, value: r1(avg(rs.map((r) => r.value))) }
  }).sort((a, b) => a.test.localeCompare(b.test))
}

/** Body map nodes from 7-day averages (BP, sugar, pulse, weight, steps a day, sleep a night); mood stays the latest. */
export function averageNodes(readings: Reading[], acts: Activity[], now: Date, familyOf: (r: Reading) => Range | undefined = () => undefined): NodeView[] {
  const avgs = weekAverages(readings, now)
  const week = acts.filter((a) => a.startedAt && now.getTime() - Date.parse(a.startedAt) <= 7 * DAY)
  const base = bodyNodes(avgs, acts, now, familyOf)
  const perDay = (kind: string, f: 'minutes' | 'steps') => {
    const days = new Map<string, number>()
    for (const a of week) if (a.kind === kind && isNum(a[f])) days.set(localDay(a.startedAt), (days.get(localDay(a.startedAt)) ?? 0) + (a[f] as number))
    return days.size ? avg([...days.values()]) : null
  }
  const NOTE = '7-day avg'
  return base.map((n): NodeView => {
    if (n.id === 'sleep') { const m = perDay('sleep', 'minutes'); return m == null ? { ...n, value: '--', note: 'No data yet', empty: true } : { ...n, value: hoursMinutes(m), note: NOTE, empty: false } }
    if (n.id === 'steps') { const s = perDay('steps', 'steps'); return s == null ? { ...n, value: '--', note: 'No data yet', empty: true } : { ...n, value: Math.round(s).toLocaleString('en-PH'), note: NOTE, empty: false } }
    if (n.id === 'mood') return n.empty ? n : { ...n, note: n.note }
    if (n.id === 'pulse') {
      const hr = avgs.find((r) => r.test === 'heart_rate')
      if (!hr) return { ...n, value: '--', note: 'No data yet', empty: true }
      const st = positionOf(hr, familyOf(hr))
      return { ...n, value: formatNumber(Math.round(hr.value)), state: st, note: st === 'within' ? 'In range' : st === 'above' ? 'A bit high' : st === 'below' ? 'A bit low' : NOTE, empty: false }
    }
    if (n.empty && (n.id === 'bp' || n.id === 'sugar' || n.id === 'weight')) return { ...n, note: 'No data yet' }
    const note = n.note === 'In range' || n.note === 'A bit high' || n.note === 'A bit low' ? n.note : NOTE
    return { ...n, note }
  }).map((n) => (n.id === 'bp' && !n.empty ? { ...n, value: n.value.split('/').map((x) => (/^\d+$/.test(x) ? x : formatNumber(Math.round(Number(x))))).join('/') } : n))
}


// ---- Normal -----------------------------------------------------------------------------------------------
export interface NormalInfo { code: string; label: string; range: string; line: string; low: number | null; high: number | null; unit: string }
/** The standard ranges shown by the "Normal" toggle, one plain line each. Sources: the cited guide in guide-ranges.json (blood pressure, sugar); resting pulse as printed in PART-3 5.1. General information, not a target. */
export const NORMAL: NormalInfo[] = [
  { code: 'bp_systolic', label: 'Blood pressure', range: 'Under 120/80', unit: 'mmHg', low: null, high: 119, line: 'Normal is under 120 over 80. 120 to 129 on top with the bottom under 80 is a little raised. 130/80 or more is high.' },
  { code: 'fasting_glucose', label: 'Fasting sugar', range: '70 to 100 mg/dL', unit: 'mg/dL', low: 70, high: 100, line: 'Measured after 8 hours without food. Same as 3.9 to 5.6 mmol/L. 100 to 125 is a little high; ask your doctor.' },
  { code: 'heart_rate', label: 'Resting pulse', range: '60 to 100 bpm', unit: 'bpm', low: 60, high: 100, line: 'Beats a minute after resting 5 minutes. Fitter people can be lower. Tell your doctor about dizziness or chest pain.' },
  { code: 'weight', label: 'Weight', range: 'Depends on your height', unit: 'kg', low: null, high: null, line: 'No single normal number. Watch the weeks, not one day, and ask your doctor what is right for you.' }
]

// ---- Labs: plain-language flags ---------------------------------------------------------------------------
/** One line for a lab result outside (or inside) its range. Never a diagnosis. */
export function labFlagLine(pos: Position, name: string): string {
  return pos === 'above' ? `${name} is a bit high. Ask your doctor at the next visit.`
    : pos === 'below' ? `${name} is a bit low. Ask your doctor at the next visit.`
    : pos === 'within' ? `${name} is in the usual range.`
    : `${name} has no range to compare with yet.`
}

