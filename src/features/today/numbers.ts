import type { Tint } from '../look'
import { isOldLead, leadRow } from '../health/attention'
import { labDate, labRow } from '../health/labsLogic'
import { metricLabel, readingPosition, shortDate } from '../health/model'
import { latestByTest, type Range, type Reading } from '../health/ranges'
import { VITAL_TESTS } from '../health/vitals'

export interface NumberTile { kicker: string; tint: Tint; value: string; sub: string; action: string; href: string; valueSize?: 'md' }
const VITALS = new Set<string>(VITAL_TESTS)
const newest = (rs: Reading[]) => [...rs].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]

/** The lab Today leads with: the same ranking as the Health hero (health/attention leadRow) over the latest result of each lab test. Labs only; blood pressure and sugar have their own tiles. */
export function pickLeadLab(readings: Reading[], now: Date, familyOf: (r: Reading) => Range | undefined = () => undefined): Reading | undefined {
  const labs = latestByTest(readings.filter((r) => !VITALS.has(r.test)))
  return leadRow(labs.map((r) => labRow(r, familyOf(r))), now)?.reading
}

/** Today's carousel: latest blood pressure, sugar and the lead lab. Missing data is an honest empty tile, never a made-up number. */
export function numberTiles(readings: Reading[], now: Date, familyOf: (r: Reading) => Range | undefined = () => undefined): NumberTile[] {
  const sys = newest(readings.filter((r) => r.test === 'bp_systolic'))
  const dia = sys && readings.find((r) => r.test === 'bp_diastolic' && r.takenAt === sys.takenAt)
  const bp: NumberTile = sys
    ? { kicker: 'Blood pressure', tint: 'blue', value: `${sys.value}/${dia?.value ?? '--'}`, sub: shortDate(sys.takenAt), action: 'Readings', href: '#health/metric/bp_systolic' }
    : { kicker: 'Blood pressure', tint: 'blue', value: '--/--', sub: 'No reading yet', action: 'Log now', href: '#health/metric/bp_systolic', valueSize: 'md' }
  const sg = newest(readings.filter((r) => r.test === 'fasting_glucose' || r.test === 'glucose'))
  const sugar: NumberTile = sg
    ? { kicker: 'Sugar', tint: 'teal', value: String(sg.value), sub: `${sg.unit ?? ''} · ${shortDate(sg.takenAt)}`.trim(), action: 'Readings', href: `#health/metric/${sg.test}` }
    : { kicker: 'Sugar', tint: 'teal', value: '--', sub: 'Nothing logged yet', action: 'Log now', href: '#health/metric/glucose', valueSize: 'md' }
  const lab = pickLeadLab(readings, now, familyOf)
  const pos = lab ? readingPosition(lab, familyOf(lab)) : 'none'
  const when = lab && (isOldLead(lab, now) ? labDate(lab.takenAt, true) : shortDate(lab.takenAt)) // an old result carries its year
  const labTile: NumberTile = lab
    ? { kicker: metricLabel(lab.test), tint: pos === 'within' ? 'green' : pos === 'none' ? 'purple' : 'red', value: String(lab.value), sub: `${pos === 'above' ? 'High' : pos === 'below' ? 'Low' : pos === 'within' ? 'In range' : 'No range'} · ${when}`, action: 'Labs', href: '#health/labs' }
    : { kicker: 'Lab results', tint: 'purple', value: '--', sub: 'No lab paper yet', action: 'Add a lab paper', href: '#health/labs', valueSize: 'md' }
  return pos === 'above' || pos === 'below' ? [labTile, bp, sugar] : [bp, sugar, labTile] // a High or Low lab leads
}
