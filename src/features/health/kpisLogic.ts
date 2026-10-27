import { formatNumber } from '../../lib/labFormat'
import type { MedTaken, Medication } from '../log/store'
import { computeMyWeek, STEP_GOAL, type StepRow } from '../today/myWeekLogic'
import { dayOf } from './meds'
import { rangeState, toCanonicalReading, type Position, type Reading, type RangeState } from './ranges'
import { positionOf } from './vitals'
import type { BpArg } from './verdict'

/** "My KPIs": the LATEST reading per measure with its time, a 7-day sparkline and a range chip. The sparklines and the doses figure come from the
 *  same computation as Today's "My week" (computeMyWeek), so the two never disagree. Pure. */
export interface Kpi {
  code: string
  href: string
  label: string
  value: string
  unit: string
  /** "today 7:30 AM", "yesterday 6:45 AM", "Sat 18 Oct". */
  when: string
  sub: string
  state?: RangeState
  spark: (number | null)[]
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clock = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`

/** When a reading was taken, in the words a person uses. */
export function whenWords(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = dayOf(d)
  if (day === dayOf(now)) return `today ${clock(d)}`
  if (day === dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12))) return `yesterday ${clock(d)}`
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`
}

const latestOf = (rs: Reading[], test: string) => rs.filter((r) => r.test === test && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
/** The chip word comes from the one verdict table (verdict.ts), in the same bands as the Normal text. */
const chip = (kind: 'bp' | 'vital', pos: Position, top?: number, bottom?: number | null, doctor?: BpArg['doctor']): RangeState => rangeState(pos, kind, { top, bottom, doctor })
const worst = (ps: string[]) => ps.find((p) => p === 'above' || p === 'below') ?? ps.find((p) => p === 'within') ?? 'none'

/** doctor: both of this person's BP targets (bpDoctorOf), so the chip reads the same word as the Vitals rows and My week. */
export function computeKpis(i: { personId: string; readings: Reading[]; activity: StepRow[]; meds: Medication[]; takes: MedTaken[]; now: Date; doctor?: BpArg['doctor'] }): Kpi[] {
  const mine = i.readings.filter((r) => r.personId === i.personId).map(toCanonicalReading).filter((r): r is Reading => !!r) // glucose in mmol/L is converted; a unit that cannot be compared is left out
  const week = computeMyWeek({ personId: i.personId, readings: mine, activity: i.activity, meds: i.meds, takes: i.takes, now: i.now, doctor: i.doctor })
  const spark = (code: string) => week.find((t) => t.code === code)?.spark ?? []
  const out: Kpi[] = []

  const sys = latestOf(mine, 'bp_systolic')
  if (sys) {
    const t = Date.parse(sys.takenAt)
    const dia = mine.filter((r) => r.test === 'bp_diastolic').sort((a, b) => Math.abs(Date.parse(a.takenAt) - t) - Math.abs(Date.parse(b.takenAt) - t))[0]
    const pair = dia && Math.abs(Date.parse(dia.takenAt) - t) <= 30 * 60_000 ? dia : undefined
    out.push({
      code: 'bp_systolic', href: '#health/metric/bp_systolic', label: 'Blood pressure', value: pair ? `${formatNumber(sys.value)}/${formatNumber(pair.value)}` : formatNumber(sys.value), unit: 'mmHg',
      when: whenWords(sys.takenAt, i.now), sub: 'latest', state: chip('bp', worst([positionOf(sys), pair ? positionOf(pair) : 'none']) as Position, sys.value, pair?.value ?? null, i.doctor), spark: spark('bp_systolic')
    })
  }
  const sug = latestOf(mine, 'fasting_glucose')
  if (sug) out.push({ code: 'fasting_glucose', href: '#health/metric/fasting_glucose', label: 'Fasting sugar', value: formatNumber(sug.value), unit: sug.unit ?? 'mg/dL', when: whenWords(sug.takenAt, i.now), sub: 'latest', state: chip('vital', positionOf(sug)), spark: spark('fasting_glucose') })
  const wt = latestOf(mine, 'weight')
  if (wt) out.push({ code: 'weight', href: '#health/metric/weight', label: 'Weight', value: formatNumber(wt.value), unit: wt.unit ?? 'kg', when: whenWords(wt.takenAt, i.now), sub: 'latest', spark: spark('weight') })

  // steps: the newest day that has any, as a day total
  const stepRows = i.activity.filter((a) => (a.personId == null || a.personId === i.personId) && a.kind === 'steps' && typeof a.steps === 'number' && a.steps > 0)
  const lastDay = stepRows.map((a) => dayOf(a.startedAt)).sort().at(-1)
  if (lastDay) {
    const total = stepRows.filter((a) => dayOf(a.startedAt) === lastDay).reduce((s, a) => s + (a.steps ?? 0), 0)
    const today = lastDay === dayOf(i.now)
    out.push({ code: 'steps', href: '#health/metric/steps', label: 'Steps', value: total.toLocaleString('en-US'), unit: '', when: today ? 'today so far' : whenWords(`${lastDay}T12:00:00`, i.now), sub: `Goal ${STEP_GOAL.toLocaleString('en-US')}`, spark: spark('steps') })
  }
  const doses = week.find((t) => t.code === 'doses')
  if (doses) out.push({ code: 'doses', href: '#health/meds', label: 'Doses on time', value: doses.value, unit: '', when: 'last 7 days', sub: doses.sub, spark: doses.spark })
  const hr = latestOf(mine, 'heart_rate')
  if (hr) out.push({ code: 'heart_rate', href: '#health/metric/heart_rate', label: 'Resting heart', value: formatNumber(hr.value), unit: hr.unit ?? 'bpm', when: whenWords(hr.takenAt, i.now), sub: 'latest', state: rangeState(positionOf(hr), 'vital'), spark: spark('heart_rate') })
  return out
}
