import { formatNumber } from '../../lib/labFormat'
import { hoursMinutes, localDay, readingPosition, bodyNodes, type Activity, type NodeView } from './model'
import { GUIDE, toCanonicalReading, type Position, type Range, type Reading } from './ranges'
import { verdictFor } from './verdict'

/** Vitals vs labs, 7-day averages and the "Normal" explanations for the Health overview. Pure. */
export const VITAL_TESTS = ['bp_systolic', 'bp_diastolic', 'fasting_glucose', 'glucose', 'heart_rate', 'weight', 'spo2', 'temperature']
/** Vitals in reading order: blood pressure top before bottom, then sugar, pulse, weight. */
export const byVitalOrder = <T extends { test: string }>(rows: T[]): T[] => [...rows].sort((a, b) => (VITAL_TESTS.indexOf(a.test) + 1 || 99) - (VITAL_TESTS.indexOf(b.test) + 1 || 99) || a.test.localeCompare(b.test))
export const isVital = (test: string) => VITAL_TESTS.includes(test)
/** Resting pulse for adults, from the one guide file (guide-ranges.json). */
export const PULSE_RANGE: Range = { low: GUIDE.heart_rate!.low, high: GUIDE.heart_rate!.high }
const DAY = 86_400_000
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const avg = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
const r1 = (n: number) => Math.round(n * 10) / 10

/** A reading judged like the rest (one source of truth: ranges.ts and guide-ranges.json). */
export const positionOf = (r: Reading, family?: Range | null): Position => readingPosition(r, family)

/** One synthetic reading per test: the average of the last 7 days (the newest reading's time, unit and lab range). Tests with nothing in the week are left out. */
export function weekAverages(readings: Reading[], now: Date): Reading[] {
  const by = new Map<string, Reading[]>()
  for (const raw of readings) {
    const r = toCanonicalReading(raw) // glucose in mmol/L becomes mg/dL; a unit that cannot be compared is left out, never mixed in
    const t = Date.parse(raw.takenAt)
    if (!r || !isNum(r.value) || !Number.isFinite(t) || now.getTime() - t > 7 * DAY || t > now.getTime() + DAY) continue
    const k = `${r.test}|${(r.unit ?? '').toLowerCase()}`
    by.set(k, [...(by.get(k) ?? []), r])
  }
  const best = new Map<string, Reading[]>() // one row per test: the unit of its newest reading
  for (const rs of by.values()) {
    const newest = Math.max(...rs.map((r) => Date.parse(r.takenAt)))
    const cur = best.get(rs[0]!.test)
    if (!cur || newest > Math.max(...cur.map((r) => Date.parse(r.takenAt)))) best.set(rs[0]!.test, rs)
  }
  return [...best.values()].map((rs) => {
    const newest = [...rs].sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]!
    const mean = avg(rs.map((r) => r.value))
    return { ...newest, value: newest.test.startsWith('bp_') ? Math.round(mean) : r1(mean) } // blood pressure in whole numbers
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
      return { ...n, value: formatNumber(Math.round(hr.value)), state: st, note: verdictFor('vital', st)?.word ?? NOTE, empty: false }
    }
    if (n.empty && (n.id === 'bp' || n.id === 'sugar' || n.id === 'weight')) return { ...n, note: 'No data yet' }
    const note = n.state !== 'none' && n.note ? n.note : NOTE
    return { ...n, note }
  }).map((n) => (n.id === 'bp' && !n.empty ? { ...n, value: n.value.split('/').map((x) => (/^\d+$/.test(x) ? x : formatNumber(Math.round(Number(x))))).join('/') } : n))
}


// ---- Normal -----------------------------------------------------------------------------------------------
export interface NormalInfo { code: string; label: string; range: string; line: string; low: number | null; high: number | null; unit: string }
const G = GUIDE
/** The standard ranges shown by the "Normal" toggle, one plain line each. Every number is read from the guide (guide-ranges.json), so the colour on a reading and this text always agree. General information, not a target. */
export const NORMAL: NormalInfo[] = [
  { code: 'bp_systolic', label: 'Blood pressure', range: `Under ${G.bp_systolic!.high! + 1}/${G.bp_diastolic!.high! + 1}`, unit: 'mmHg', low: null, high: G.bp_systolic!.high, line: `Normal is under ${G.bp_systolic!.high! + 1} over ${G.bp_diastolic!.high! + 1}. ${G.bp_systolic!.high! + 1} to 129 on top with the bottom under ${G.bp_diastolic!.high! + 1} is a little raised. 130 to 134 on top, or 80 to 84 on the bottom, is above target. 135/85 or more is high. Under 90 or 60 is low.` },
  { code: 'fasting_glucose', label: 'Fasting sugar', range: G.fasting_glucose!.text, unit: 'mg/dL', low: G.fasting_glucose!.low, high: G.fasting_glucose!.high, line: `Measured after 8 hours without food. ${G.fasting_glucose!.high! + 1} and over is a bit high and under ${G.fasting_glucose!.low} is low; ask your doctor.` },
  { code: 'heart_rate', label: 'Resting pulse', range: `${G.heart_rate!.text} bpm`, unit: 'bpm', low: G.heart_rate!.low, high: G.heart_rate!.high, line: 'Beats a minute after resting 5 minutes. Fitter people can be lower. Tell your doctor about dizziness or chest pain.' },
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

