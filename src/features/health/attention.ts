import { labRow, type LabRow } from './labsLogic'
import type { Range, Reading } from './ranges'

export interface Attention { reading: Reading; row: LabRow; pair?: { top: number; bottom: number } }

const ms = (r: Reading) => Date.parse(r.takenAt)

/** The one result the overview leads with: the newest that is out of its range; else the newest that has a range; else the newest of all. `latest` is one reading per test (latestByTest).
 *  A top BP number carries its bottom number when both were taken within 60 seconds. The bottom number never leads on its own. Null when there is nothing. */
export function pickAttention(latest: Reading[], familyOf: (r: Reading) => Range | undefined, _now: Date): Attention | null {
  const rows = latest.filter((r) => r.test !== 'bp_diastolic' && Number.isFinite(ms(r))).map((r) => labRow(r, familyOf(r)))
  const newest = (xs: LabRow[]) => [...xs].sort((a, b) => ms(b.reading) - ms(a.reading))[0]
  const row = newest(rows.filter((x) => x.pos === 'above' || x.pos === 'below')) ?? newest(rows.filter((x) => x.range)) ?? newest(rows)
  if (!row) return null
  const out: Attention = { reading: row.reading, row }
  if (row.reading.test === 'bp_systolic') {
    const dia = latest.find((r) => r.test === 'bp_diastolic' && Math.abs(ms(r) - ms(row.reading)) <= 60_000)
    if (dia) out.pair = { top: row.reading.value, bottom: dia.value }
  }
  return out
}
