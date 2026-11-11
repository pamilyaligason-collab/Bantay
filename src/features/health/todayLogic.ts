import { formatNumber } from '../../lib/labFormat'
import type { WaterEntry } from '../log/store'
import { goalGlasses } from '../nutrition/waterGoal'
import { STEP_GOAL } from '../today/myWeekLogic'
import { whenWords } from './kpisLogic'
import { dayOf, type DoseState } from './meds'
import { bpHeadlineArg } from './MetricScreen'
import { bodyNodes, localDay, stepDayTotals, type Activity } from './model'
import { toCanonicalReading, type Reading } from './ranges'
import { dailyActivity, dailyCount, dailyMean, type Series } from './trendLogic'

/** One tile of the Today row. `empty` means no data today: value is "--", never 0 (null is not 0). */
export interface TodayTile { code: 'bp' | 'pulse' | 'water' | 'steps' | 'sleep' | 'meds'; label: string; value: string; sub: string; href: string; tint: 'blue' | 'red' | 'teal' | 'amber' | 'purple' | 'green'; empty: boolean
  /** The last 7 local days, oldest first; a day with no data is null (never 0). */
  spark: Series
  /** 0..1 progress for today (steps against the goal, glasses against the goal, medicines taken), null when there is nothing to measure. */
  ring: number | null }

const NONE = 'No reading yet'
const latestToday = (rs: Reading[], test: string, now: Date) =>
  rs.filter((r) => r.test === test && dayOf(r.takenAt) === dayOf(now) && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]

/** Six small stat tiles for today, from data the screen already loads. Pure. `doses` and `goalMl` are null until read. */
export function todayTiles(i: { personId: string; readings: Reading[]; activity: Activity[]; doses: DoseState[] | null; hasMeds?: boolean; water: WaterEntry[]; goalMl: number | null; goalSource?: string; now: Date }): TodayTile[] {
  const mine = i.readings.filter((r) => r.personId === i.personId).map(toCanonicalReading).filter((r): r is Reading => !!r)
  const sys = latestToday(mine, 'bp_systolic', i.now)
  const dia = sys ? bpHeadlineArg(mine, 'bp_systolic', sys, undefined).bottom : undefined // same pairing as the Readings card
  const hr = latestToday(mine, 'heart_rate', i.now)
  const glasses = i.water.filter((w) => w.personId === i.personId && dayOf(w.drunkAt) === dayOf(i.now)).length
  const goalGl = i.goalMl == null ? null : goalGlasses(i.goalMl, i.goalSource) // null = no goal (the Water tile is dropped below)
  const steps = stepDayTotals(i.activity).get(localDay(i.now.toISOString())) ?? null // activity is already this person's (useActivity); overlaps and a second source count once
  const sleep = bodyNodes([], i.activity, i.now).find((n) => n.id === 'sleep')!
  const taken = i.doses?.filter((d) => d.state === 'taken').length ?? 0
  const unit = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : null)
  const clock = (iso: string) => whenWords(iso, i.now).replace(/^today /, '')
  const tiles: TodayTile[] = [
    { code: 'bp', label: 'BP', tint: 'blue', href: '#health/metric/bp_systolic', empty: !sys, value: sys ? (dia != null ? `${formatNumber(sys.value)}/${formatNumber(dia)}` : formatNumber(sys.value)) : '--', sub: sys ? clock(sys.takenAt) : NONE, spark: dailyMean(mine, 'bp_systolic', i.now), ring: null },
    { code: 'pulse', label: 'Pulse', tint: 'red', href: '#health/metric/heart_rate', empty: !hr, value: hr ? formatNumber(hr.value) : '--', sub: hr ? `${hr.unit || 'bpm'} · ${clock(hr.takenAt)}` : NONE, spark: dailyMean(mine, 'heart_rate', i.now), ring: null },
    { code: 'water', label: 'Water', tint: 'teal', href: '#health/metric/water', empty: glasses === 0, value: glasses ? `${glasses}/${goalGl}` : '--', sub: glasses ? (glasses === 1 ? 'glass' : 'glasses') : 'Nothing logged today', spark: dailyCount(i.water.filter((w) => w.personId === i.personId).map((w) => w.drunkAt), i.now), ring: glasses > 0 && goalGl != null ? unit(glasses, goalGl) : null },
    { code: 'steps', label: 'Steps', tint: 'amber', href: '#health/metric/steps', empty: steps == null, value: steps != null ? steps.toLocaleString('en-US') : '--', sub: steps != null ? `of ${STEP_GOAL.toLocaleString('en-US')}` : NONE, spark: dailyActivity(i.activity, 'steps', i.now), ring: steps != null ? unit(steps, STEP_GOAL) : null },
    { code: 'sleep', label: 'Sleep', tint: 'purple', href: '#health/metric/sleep', empty: sleep.empty, value: sleep.value, sub: sleep.empty ? NONE : sleep.note, spark: dailyActivity(i.activity, 'sleep', i.now), ring: null },
    { code: 'meds', label: 'Medicines', tint: 'green', href: '#health/meds', empty: !i.doses?.length, value: i.doses?.length ? `${taken}/${i.doses.length}` : '--', sub: i.doses?.length ? 'taken' : i.doses ? (i.hasMeds === false ? 'No medicines yet' : 'None due today') : '', spark: [], ring: i.doses?.length ? unit(taken, i.doses.length) : null }
  ]
  return i.goalMl == null ? tiles.filter((t) => t.code !== 'water') : tiles // no water goal (a baby under 1 year): no Water tile
}
