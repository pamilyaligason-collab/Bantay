import { formatNumber } from '../../lib/labFormat'
import { dayOf, isLive, normaliseDrug, slotsFor } from '../health/meds'
import { readingPosition } from '../health/model'
import { rangeState, toCanonicalReading, type RangeState } from '../health/ranges'
import type { Position, Reading } from '../health/ranges'
import type { MedTaken, Medication } from '../log/store'

/** A step row; personId is absent on rows already filtered to one person. */
export interface StepRow { kind: string; steps: number | null; startedAt: string; personId?: string }

/** "My week": the last 7 days of the signed-in person's own numbers, as tiles. Pure: no React, no storage.
 *  A tile with no data is not returned (never a zero). Days with no reading are gaps in the sparkline. */

export const STEP_GOAL = 6000
export const DAYS = 7
export const ON_TIME_MIN = 120 // H1: a dose is on time when taken within 2 hours of its slot

export interface Tile {
  code: string // #health/metric/<code>; doses open #health
  href: string
  label: string
  value: string
  unit: string
  sub: string
  /** Range chip (blood pressure and sugar only). */
  state?: RangeState
  /** One slot per day, oldest first, null where nothing was logged. */
  spark: (number | null)[]
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const avg = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
const r1 = (n: number) => Math.round(n * 10) / 10

/** The 7 local calendar days ending today, oldest first, as YYYY-MM-DD. */
export function lastDays(now: Date, n = DAYS): string[] {
  return Array.from({ length: n }, (_, i) => dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i), 12)))
}

/** Values of one test per day inside the window. */
function byDay(rows: Reading[], test: string, days: string[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (const r of rows) {
    if (r.test !== test || !isNum(r.value)) continue
    const d = dayOf(r.takenAt)
    if (days.includes(d)) m.set(d, [...(m.get(d) ?? []), r.value])
  }
  return m
}
const sparkOf = (days: string[], m: Map<string, number[]>, f: (v: number[]) => number): (number | null)[] => days.map((d) => (m.has(d) ? f(m.get(d)!) : null))
const flat = (m: Map<string, number[]>) => [...m.values()].flat()
const worst = (ps: Position[]): Position => (ps.find((p) => p === 'above' || p === 'below') ?? ps.find((p) => p === 'within') ?? 'none')
const reading = (test: string, value: number, unit: string): Reading => ({ personId: '', takenAt: '', test, value, unit })

export function computeMyWeek(i: { personId: string; readings: Reading[]; activity: StepRow[]; meds: Medication[]; takes: MedTaken[]; now: Date }): Tile[] {
  const days = lastDays(i.now)
  const mine = i.readings.filter((r) => r.personId === i.personId).map(toCanonicalReading).filter((r): r is Reading => !!r) // one unit per measure: glucose mmol/L -> mg/dL, an unknown unit is not averaged
  const tiles: Tile[] = []

  // blood pressure: average top / bottom, judged on the worse of the two (same rule as the Health body map)
  const sys = byDay(mine, 'bp_systolic', days)
  const dia = byDay(mine, 'bp_diastolic', days)
  if (sys.size) {
    const s = Math.round(avg(flat(sys)))
    const d = dia.size ? Math.round(avg(flat(dia))) : null
    tiles.push({
      code: 'bp_systolic', href: '#health/metric/bp_systolic', label: 'Blood pressure', value: d == null ? String(s) : `${s}/${d}`, unit: 'mmHg',
      sub: `average of ${flat(sys).length} ${flat(sys).length === 1 ? 'reading' : 'readings'}`, state: rangeState(worst([readingPosition(reading('bp_systolic', s, 'mmHg')), d == null ? 'none' : readingPosition(reading('bp_diastolic', d, 'mmHg'))])), spark: sparkOf(days, sys, (v) => Math.round(avg(v)))
    })
  }

  const sugar = byDay(mine, 'fasting_glucose', days)
  if (sugar.size) {
    const v = Math.round(avg(flat(sugar)))
    tiles.push({
      code: 'fasting_glucose', href: '#health/metric/fasting_glucose', label: 'Fasting sugar', value: String(v), unit: 'mg/dL',
      sub: `average of ${flat(sugar).length} ${flat(sugar).length === 1 ? 'reading' : 'readings'}`, state: rangeState(readingPosition(reading('fasting_glucose', v, 'mg/dL'))), spark: sparkOf(days, sugar, (v2) => Math.round(avg(v2)))
    })
  }

  // weight: change from the first to the last reading this week; a single reading shows the weight itself
  const wt = mine.filter((r) => r.test === 'weight' && isNum(r.value) && days.includes(dayOf(r.takenAt))).sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  if (wt.length) {
    const first = wt[0]!.value
    const last = wt[wt.length - 1]!.value
    const change = r1(last - first)
    const wm = byDay(mine, 'weight', days)
    tiles.push({
      code: 'weight', href: '#health/metric/weight', label: 'Weight',
      value: wt.length < 2 ? formatNumber(r1(last)) : change === 0 ? 'Same' : `${change > 0 ? '+' : '-'}${formatNumber(Math.abs(change))}`,
      unit: wt.length < 2 ? 'kg' : change === 0 ? 'as last time' : 'kg this week', sub: wt.length < 2 ? 'latest reading' : `now ${formatNumber(r1(last))} kg`, spark: sparkOf(days, wm, (v) => v[v.length - 1]!)
    })
  }

  // steps a day, against the goal
  const steps = new Map<string, number[]>()
  for (const a of i.activity) {
    if ((a.personId != null && a.personId !== i.personId) || a.kind !== 'steps' || !isNum(a.steps) || a.steps <= 0) continue
    const d = dayOf(a.startedAt)
    if (days.includes(d)) steps.set(d, [...(steps.get(d) ?? []), a.steps])
  }
  if (steps.size) {
    const daily = sparkOf(days, steps, (v) => v.reduce((s, n) => s + n, 0))
    const got = daily.filter(isNum)
    const per = Math.round(avg(got))
    tiles.push({ code: 'steps', href: '#health/metric/steps', label: 'Steps a day', value: per.toLocaleString('en-US'), unit: 'steps', sub: `goal ${STEP_GOAL.toLocaleString('en-US')}${per >= STEP_GOAL ? ', reached' : ''}`, spark: daily })
  }

  // doses on time (H1): a dose counts when it was taken within 2 hours of its time. Each medicine counts from its first day (started on, else its first take, else today);
  // today counts a slot only once it was taken on time or its 2 hours have passed.
  const nowMin = i.now.getHours() * 60 + i.now.getMinutes()
  const today = dayOf(i.now)
  const myTakes = i.takes.filter((t) => t.personId === i.personId && !t.skipped)
  const firstDay = new Map<string, string>()
  for (const m of i.meds) {
    const key = m.serverId ?? m.clientId ?? String(m.id ?? m.name)
    const taken = myTakes.filter((t) => (m.serverId && t.medicationId === m.serverId) || (!t.medicationId && t.name.trim().toLowerCase() === m.name.trim().toLowerCase())).map((t) => dayOf(t.takenAt)).sort()[0]
    firstDay.set(key, m.startedOn?.slice(0, 10) ?? taken ?? today)
  }
  let want = 0
  let done = 0
  const perDay = days.map((d) => {
    const used = new Set<MedTaken>()
    let dayWant = 0
    let dayDone = 0
    for (const sl of slotsFor(i.meds, i.personId, d)) {
      if (d < (firstDay.get(sl.key) ?? today)) continue
      const hit = myTakes.filter((t) => !used.has(t) && dayOf(t.takenAt) === d && (sl.medicationId ? t.medicationId === sl.medicationId && t.slot === sl.slot : !t.medicationId && t.name.trim().toLowerCase() === sl.name.trim().toLowerCase()))
        .map((t) => ({ t, gap: Math.abs(new Date(t.takenAt).getHours() * 60 + new Date(t.takenAt).getMinutes() - sl.at) })).filter((x) => x.gap <= ON_TIME_MIN).sort((a, b) => a.gap - b.gap)[0]
      if (hit) used.add(hit.t)
      else if (d === today && sl.at + ON_TIME_MIN > nowMin) continue // still inside its 2 hours
      dayWant++
      if (hit) dayDone++
    }
    want += dayWant
    done += dayDone
    return dayWant ? dayDone : null
  })
  if (want > 0) tiles.push({ code: 'doses', href: '#health', label: 'Doses on time', value: `${done} of ${want}`, unit: '', sub: done >= want ? 'all within 2 hours of the time' : 'taken within 2 hours of the time', spark: perDay })

  // resting heart rate: the lowest reading of each day, averaged
  const hr = byDay(mine, 'heart_rate', days)
  if (hr.size) {
    const lows = sparkOf(days, hr, (v) => Math.min(...v))
    tiles.push({ code: 'heart_rate', href: '#health/metric/heart_rate', label: 'Resting heart rate', value: String(Math.round(avg(lows.filter(isNum)))), unit: 'bpm', sub: 'lowest of each day', spark: lows })
  }
  return tiles
}

/** Polyline points for a 7-slot sparkline in a w x h box, or null when fewer than 2 days have data (one dot is not a trend). */
export function sparkPoints(spark: (number | null)[], w: number, h: number, pad = 3): { x: number; y: number }[] | null {
  const pts = spark.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return null
  const lo = Math.min(...pts.map((p) => p.v))
  const hi = Math.max(...pts.map((p) => p.v))
  const span = hi - lo || 1
  return pts.map((p) => ({ x: pad + (p.i / Math.max(1, spark.length - 1)) * (w - 2 * pad), y: hi === lo ? h / 2 : h - pad - ((p.v - lo) / span) * (h - 2 * pad) }))
}

const BP_DRUGS = ['losartan', 'amlodipine', 'valsartan', 'telmisartan', 'lisinopril', 'enalapril', 'atenolol', 'metoprolol', 'carvedilol', 'bisoprolol', 'nifedipine', 'hydrochlorothiazide', 'candesartan', 'irbesartan', 'olmesartan', 'captopril', 'perindopril', 'ramipril', 'clonidine', 'indapamide', 'felodipine', 'methyldopa'] // nudge only (H6): a reading reminder, never a dose rule
const SUGAR_DRUGS = ['metformin', 'gliclazide', 'glimepiride', 'glibenclamide', 'sitagliptin', 'vildagliptin', 'linagliptin', 'pioglitazone', 'empagliflozin', 'dapagliflozin', 'insulin', 'glipizide', 'acarbose', 'canagliflozin']
const has = (name: string, list: string[]) => { const n = normaliseDrug(name) ?? ''; return list.some((d) => n.includes(d)) }

/** H6 nudge: "Next reading due: blood pressure" when this person takes a blood pressure (or sugar) medicine and logged no such reading in the last 7 days. null otherwise. */
export function nextReadingDue(i: { personId: string; readings: Reading[]; meds: Medication[]; now: Date }): string | null {
  const live = i.meds.filter((m) => m.personId === i.personId && isLive(m))
  const days = lastDays(i.now)
  const seen = (tests: string[]) => i.readings.some((r) => r.personId === i.personId && tests.includes(r.test) && days.includes(dayOf(r.takenAt)))
  const due: string[] = []
  if (live.some((m) => has(m.name, BP_DRUGS) || has(m.genericName ?? '', BP_DRUGS)) && !seen(['bp_systolic', 'bp_diastolic'])) due.push('blood pressure')
  if (live.some((m) => has(m.name, SUGAR_DRUGS) || has(m.genericName ?? '', SUGAR_DRUGS)) && !seen(['fasting_glucose', 'glucose'])) due.push('blood sugar')
  return due.length ? `Next reading due: ${due.join(' and ')}` : null
}
