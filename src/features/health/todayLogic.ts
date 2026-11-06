import { formatNumber } from '../../lib/labFormat'
import type { WaterEntry } from '../log/store'
import { ML_PER_TAP } from '../nutrition/logic'
import { STEP_GOAL } from '../today/myWeekLogic'
import { whenWords } from './kpisLogic'
import { dayOf, type DoseState } from './meds'
import { bpHeadlineArg } from './MetricScreen'
import { bodyNodes, type Activity } from './model'
import { toCanonicalReading, type Reading } from './ranges'

/** One tile of the Today row. `empty` means no data today: value is "--", never 0 (null is not 0). */
export interface TodayTile { code: 'bp' | 'pulse' | 'water' | 'steps' | 'sleep' | 'meds'; label: string; value: string; sub: string; href: string; tint: 'blue' | 'red' | 'teal' | 'amber' | 'purple' | 'green'; empty: boolean }

const NONE = 'No reading today'
const latestToday = (rs: Reading[], test: string, now: Date) =>
  rs.filter((r) => r.test === test && dayOf(r.takenAt) === dayOf(now) && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]

/** Six small stat tiles for today, from data the screen already loads. Pure. `doses` and `goalMl` are null until read. */
export function todayTiles(i: { personId: string; readings: Reading[]; activity: Activity[]; doses: DoseState[] | null; hasMeds?: boolean; water: WaterEntry[]; goalMl: number; now: Date }): TodayTile[] {
  const mine = i.readings.filter((r) => r.personId === i.personId).map(toCanonicalReading).filter((r): r is Reading => !!r)
  const sys = latestToday(mine, 'bp_systolic', i.now)
  const dia = sys ? bpHeadlineArg(mine, 'bp_systolic', sys, undefined).bottom : undefined // same pairing as the Readings card
  const hr = latestToday(mine, 'heart_rate', i.now)
  const glasses = i.water.filter((w) => w.personId === i.personId && dayOf(w.drunkAt) === dayOf(i.now)).length
  const goalGlasses = Math.max(1, Math.round(i.goalMl / ML_PER_TAP))
  const stepRows = i.activity.filter((a) => a.kind === 'steps' && typeof a.steps === 'number' && a.steps >= 0 && dayOf(a.startedAt) === dayOf(i.now)) // activity is already this person's (useActivity)
  const steps = stepRows.reduce((s, a) => s + (a.steps ?? 0), 0)
  const sleep = bodyNodes([], i.activity, i.now).find((n) => n.id === 'sleep')!
  const taken = i.doses?.filter((d) => d.state === 'taken').length ?? 0
  const clock = (iso: string) => whenWords(iso, i.now).replace(/^today /, '')
  return [
    { code: 'bp', label: 'BP', tint: 'blue', href: '#health/metric/bp_systolic', empty: !sys, value: sys ? (dia != null ? `${formatNumber(sys.value)}/${formatNumber(dia)}` : formatNumber(sys.value)) : '--', sub: sys ? clock(sys.takenAt) : NONE },
    { code: 'pulse', label: 'Pulse', tint: 'red', href: '#health/metric/heart_rate', empty: !hr, value: hr ? formatNumber(hr.value) : '--', sub: hr ? `${hr.unit || 'bpm'} · ${clock(hr.takenAt)}` : NONE },
    { code: 'water', label: 'Water', tint: 'teal', href: '#health/nutrition', empty: glasses === 0, value: glasses ? `${glasses}/${goalGlasses}` : '--', sub: glasses ? (glasses === 1 ? 'glass' : 'glasses') : 'Nothing logged today' },
    { code: 'steps', label: 'Steps', tint: 'amber', href: '#health/metric/steps', empty: stepRows.length === 0, value: stepRows.length ? steps.toLocaleString('en-US') : '--', sub: stepRows.length ? `of ${STEP_GOAL.toLocaleString('en-US')}` : NONE },
    { code: 'sleep', label: 'Sleep', tint: 'purple', href: '#health/metric/sleep', empty: sleep.empty, value: sleep.value, sub: sleep.empty ? NONE : sleep.note },
    { code: 'meds', label: 'Medicines', tint: 'green', href: '#health/meds', empty: !i.doses?.length, value: i.doses?.length ? `${taken}/${i.doses.length}` : '--', sub: i.doses?.length ? 'taken' : i.doses ? (i.hasMeds === false ? 'No medicines yet' : 'None due today') : '' }
  ]
}
