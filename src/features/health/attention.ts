import { labRow, overBy, type LabRow } from './labsLogic'
import type { Range, Reading } from './ranges'

export interface Attention { reading: Reading; row: LabRow; pair?: { top: number; bottom: number }; old: boolean }

const ms = (r: Reading) => Date.parse(r.takenAt)
const DAY = 86_400_000
export const LEAD_DAYS = 180
/** Older than the lead window: shown with its full date (with the year) so it never looks current. */
export const isOldLead = (r: Reading, now: Date) => now.getTime() - ms(r) > LEAD_DAYS * DAY

/** The ONE ranking for "which result leads" (Today's lab tile and the Health hero share it). `rows` = one row per test (latest only).
 *  1. Among results out of range within 180 days: the furthest outside its range as a share of the range (overBy) wins; ties by date.
 *  2. Else the newest recent result that has a range. 3. A result older than 180 days leads only when nothing newer has a range: the newest out-of-range one, else the newest with a range, else the newest. */
export function leadRow(rows: LabRow[], now: Date): LabRow | undefined {
  const valid = rows.filter((x) => Number.isFinite(ms(x.reading)))
  const newest = (xs: LabRow[]) => [...xs].sort((a, b) => ms(b.reading) - ms(a.reading))[0]
  const isOut = (x: LabRow) => x.pos === 'above' || x.pos === 'below'
  const recent = valid.filter((x) => !isOldLead(x.reading, now))
  const furthest = (xs: LabRow[]) => [...xs].sort((a, b) => (overBy(b) ?? 0) - (overBy(a) ?? 0) || ms(b.reading) - ms(a.reading))[0]
  // a phone-sensor pulse cannot be told from a resting one (no source mark on readings), so it leads only when nothing else is out of range
  const worst = furthest(recent.filter((x) => isOut(x) && x.reading.test !== 'heart_rate')) ?? furthest(recent.filter(isOut))
  return worst ?? newest(recent.filter((x) => x.range)) ?? newest(valid.filter(isOut)) ?? newest(valid.filter((x) => x.range)) ?? newest(valid)
}

/** The one result the overview leads with (see leadRow). `latest` is one reading per test (latestByTest).
 *  A top BP number carries its bottom number when both were taken within 60 seconds. The bottom number never leads on its own. `old` = older than 180 days: show its date with the year. Null when there is nothing. */
export function pickAttention(latest: Reading[], familyOf: (r: Reading) => Range | undefined, now: Date): Attention | null {
  const row = leadRow(latest.filter((r) => r.test !== 'bp_diastolic').map((r) => labRow(r, familyOf(r))), now)
  if (!row) return null
  const out: Attention = { reading: row.reading, row, old: isOldLead(row.reading, now) }
  if (row.reading.test === 'bp_systolic') {
    const dia = latest.find((r) => r.test === 'bp_diastolic' && Math.abs(ms(r) - ms(row.reading)) <= 60_000)
    if (dia) out.pair = { top: row.reading.value, bottom: dia.value }
  }
  return out
}
