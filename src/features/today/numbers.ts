import type { Tint } from '../look'
import { metricLabel, readingPosition, shortDate } from '../health/model'
import type { Reading } from '../health/ranges'

export interface NumberTile { kicker: string; tint: Tint; value: string; sub: string; action: string; href: string; valueSize?: 'md' }
const VITALS = new Set(['bp_systolic', 'bp_diastolic', 'fasting_glucose', 'glucose', 'weight', 'heart_rate', 'temperature'])
const newest = (rs: Reading[]) => [...rs].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]

/** Today's carousel: latest blood pressure, sugar and newest lab. Missing data is an honest empty tile, never a made-up number. */
export function numberTiles(readings: Reading[], now: Date): NumberTile[] {
  void now
  const sys = newest(readings.filter((r) => r.test === 'bp_systolic'))
  const dia = sys && readings.find((r) => r.test === 'bp_diastolic' && r.takenAt === sys.takenAt)
  const bp: NumberTile = sys
    ? { kicker: 'Blood pressure', tint: 'blue', value: `${sys.value}/${dia?.value ?? '--'}`, sub: shortDate(sys.takenAt), action: 'Readings', href: '#health/metric/bp_systolic' }
    : { kicker: 'Blood pressure', tint: 'blue', value: '--/--', sub: 'No reading yet', action: 'Log now', href: '#health/metric/bp_systolic', valueSize: 'md' }
  const sg = newest(readings.filter((r) => r.test === 'fasting_glucose' || r.test === 'glucose'))
  const sugar: NumberTile = sg
    ? { kicker: 'Sugar', tint: 'teal', value: String(sg.value), sub: `${sg.unit ?? ''} · ${shortDate(sg.takenAt)}`.trim(), action: 'Readings', href: `#health/metric/${sg.test}` }
    : { kicker: 'Sugar', tint: 'teal', value: '--', sub: 'Nothing logged yet', action: 'Log now', href: '#health/metric/glucose', valueSize: 'md' }
  const lab = newest(readings.filter((r) => !VITALS.has(r.test)))
  const pos = lab ? readingPosition(lab) : 'within'
  const labTile: NumberTile = lab
    ? { kicker: metricLabel(lab.test), tint: pos === 'within' ? 'green' : 'red', value: String(lab.value), sub: `${pos === 'above' ? 'High' : pos === 'below' ? 'Low' : 'In range'} · ${shortDate(lab.takenAt)}`, action: 'Labs', href: '#health/labs' }
    : { kicker: 'Lab results', tint: 'purple', value: '--', sub: 'No lab paper yet', action: 'Add a lab paper', href: '#health/labs', valueSize: 'md' }
  return [bp, sugar, labTile]
}
