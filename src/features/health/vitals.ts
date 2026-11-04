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
    if (!r || !isNum(r.value) || r.value <= 0 || !Number.isFinite(t) || now.getTime() - t > 7 * DAY || t > now.getTime() + DAY) continue
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

/** A body map node from an average over the last 7 days. `when` names the days used: "7-day average" only when 7 days had data, else "Average of 2 days". Mood is not an average: it stays the latest, `when` is its today/date note. `sub` is the verdict text, '' when there is none; `note` is what older callers show (the verdict, else `when`). */
export interface AverageNode extends NodeView { when: string; sub: string }
const AVG = '7-day average'
/** The label that states the days an average really used. */
export const avgLabel = (days: number) => (days >= 7 ? AVG : `Average of ${days} ${days === 1 ? 'day' : 'days'}`)

/** Body map nodes from 7-day averages (BP, sugar, pulse, weight, steps a day, sleep a night); mood stays the latest. */
export function averageNodes(readings: Reading[], acts: Activity[], now: Date, familyOf: (r: Reading) => Range | undefined = () => undefined): AverageNode[] {
  const avgs = weekAverages(readings, now)
  const week = acts.filter((a) => a.startedAt && now.getTime() - Date.parse(a.startedAt) <= 7 * DAY)
  const base = bodyNodes(avgs, acts, now, familyOf)
  /** Per local day totals of the newest 7 days that have data (a window of 7 x 24 h can touch 8 calendar days). */
  const dayTotals = (kind: string, f: 'minutes' | 'steps') => {
    const days = new Map<string, number>()
    // a 0 steps day is true data and stays in the average; a 0 minute sleep is no reading
    for (const a of week) if (a.kind === kind && isNum(a[f]) && (f === 'steps' ? (a[f] as number) >= 0 : (a[f] as number) > 0)) days.set(localDay(a.startedAt), (days.get(localDay(a.startedAt)) ?? 0) + (a[f] as number))
    return [...days.entries()].sort((x, y) => y[0].localeCompare(x[0])).slice(0, 7).map(([, v]) => v)
  }
  // The word of the newest reading in the week, so an average never reads as the verdict on the latest number.
  const inWeek = readings.filter((r) => { const t = Date.parse(r.takenAt); return r.value > 0 && Number.isFinite(t) && now.getTime() - t <= 7 * DAY && t <= now.getTime() + DAY })
  const newestOf = (...tests: string[]) => inWeek.filter((r) => tests.includes(r.test)).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  const latestWord = (id: string): string | undefined => {
    if (id === 'bp') {
      const sys = newestOf('bp_systolic'); const dia = newestOf('bp_diastolic')
      return sys ? verdictFor('bp', positionOf(sys, familyOf(sys)), { top: sys.value, bottom: dia?.value, doctor: { top: familyOf(sys), bottom: dia ? familyOf(dia) : null } })?.word : undefined
    }
    const r = id === 'pulse' ? newestOf('heart_rate') : id === 'sugar' ? newestOf('fasting_glucose', 'glucose') : undefined
    return r ? verdictFor('vital', positionOf(r, familyOf(r)))?.word : undefined
  }
  // only the confusing case is spelled out: an average in range beside a latest number that is not
  const withLatest = (id: string, word: string) => { const l = latestWord(id); return word === 'In range' && l && l !== 'In range' ? `Average in range · latest ${l}` : word }
  /** Days with at least one reading of these tests in the window. */
  const readingsLabel = (...tests: string[]) => avgLabel(new Set(inWeek.filter((r) => tests.includes(r.test)).map((r) => localDay(r.takenAt))).size || 7)
  const mk = (n: NodeView, when: string, sub = ''): AverageNode => ({ ...n, when, sub, note: sub || (n.empty ? n.note : when) })
  return base.map((n): AverageNode => {
    if (n.id === 'sleep') { const d = dayTotals('sleep', 'minutes'); return d.length ? mk({ ...n, value: hoursMinutes(avg(d)), empty: false }, avgLabel(d.length)) : mk({ ...n, value: '--', note: 'No data yet', empty: true }, AVG) }
    if (n.id === 'steps') { const d = dayTotals('steps', 'steps'); return d.length ? mk({ ...n, value: Math.round(avg(d)).toLocaleString('en-PH'), empty: false }, avgLabel(d.length)) : mk({ ...n, value: '--', note: 'No data yet', empty: true }, AVG) }
    if (n.id === 'mood') return { ...n, when: n.note, sub: '' } // not an average: the latest, with its today or date note
    if (n.id === 'pulse') {
      const hr = avgs.find((r) => r.test === 'heart_rate')
      if (!hr) return mk({ ...n, value: '--', note: 'No data yet', empty: true }, AVG)
      const st = positionOf(hr, familyOf(hr))
      return mk({ ...n, value: formatNumber(Math.round(hr.value)), state: st, empty: false }, readingsLabel('heart_rate'), withLatest('pulse', verdictFor('vital', st)?.word ?? ''))
    }
    if (n.empty && (n.id === 'bp' || n.id === 'sugar' || n.id === 'weight')) return mk({ ...n, note: 'No data yet' }, AVG)
    return mk(n, readingsLabel(...(n.id === 'bp' ? ['bp_systolic', 'bp_diastolic'] : n.id === 'sugar' ? ['fasting_glucose', 'glucose'] : ['weight'])), n.state !== 'none' ? withLatest(n.id, n.note) : '')
  }).map((n) => (n.id === 'bp' && !n.empty ? { ...n, value: n.value.split('/').map((x) => (/^\d+$/.test(x) ? x : formatNumber(Math.round(Number(x))))).join('/') } : n))
}


// ---- Labs: plain-language flags ---------------------------------------------------------------------------
/** One line for a lab result outside (or inside) its range. Never a diagnosis. */
export function labFlagLine(pos: Position, name: string): string {
  return pos === 'above' ? `${name} is high. Ask your doctor at the next visit.`
    : pos === 'below' ? `${name} is low. Ask your doctor at the next visit.`
    : pos === 'within' ? `${name} is in the usual range.`
    : `${name} has no range to compare with yet.`
}

