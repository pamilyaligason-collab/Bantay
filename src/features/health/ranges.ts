import guide from '../../data/guide-ranges.json'
import { verdictFor, type VerdictKind } from './verdict'

export interface Range {
  low: number | null
  high: number | null
}
export interface Reading {
  id?: number
  clientId?: string // server readings.client_id once pulled or mirrored
  personId: string
  takenAt: string // ISO date
  test: string // key in guide-ranges.json where one exists
  value: number
  unit?: string
  labLow?: number | null
  labHigh?: number | null
  sourceFileId?: string
  driveUrl?: string
  confidence?: number
  confirmedBy?: string
  confirmedAt?: string
}
export type Position = 'within' | 'below' | 'above' | 'none'

export const GUIDE_LABEL = "General guide, not your doctor's target"
export const GUIDE = guide.tests as Record<string, Range & { label: string; unit: string; text: string; source: string; url: string; year: number }>

/** Typical adult ranges for results whose lab printed none. Labs differ by method, age and sex, so these are only ever shown as a general guide.
 *  A reading whose unit does not match (creatinine in umol/L, say) gets no general range rather than a wrong one. */
const GENERAL: Record<string, Range & { unit: RegExp; text: string; alias: string[] }> = {
  rbc: { low: 4.2, high: 5.9, unit: /10|million|^m\/?u?l$/i, text: '4.2 to 5.9', alias: ['rbc', 'redbloodcell', 'redbloodcells', 'redbloodcellcount'] },
  hdl: { low: 40, high: null, unit: /mg\/?dl/i, text: '40 or more', alias: ['hdl', 'hdlcholesterol'] },
  creatinine: { low: 0.6, high: 1.3, unit: /mg\/?dl/i, text: '0.6 to 1.3', alias: ['creatinine', 'serumcreatinine', 'crea'] },
  platelets: { low: 150, high: 450, unit: /10|k\/?u?l|thou/i, text: '150 to 450', alias: ['platelets', 'platelet', 'plt', 'plateletcount'] },
  hematocrit: { low: 36, high: 50, unit: /%/, text: '36 to 50', alias: ['hematocrit', 'haematocrit', 'hct'] },
  wbc: { low: 4, high: 11, unit: /10|k\/?u?l|thou/i, text: '4.0 to 11.0', alias: ['wbc', 'whitebloodcell', 'whitebloodcells', 'whitebloodcellcount'] },
  hemoglobin: { low: 12, high: 17.5, unit: /g\/?dl/i, text: '12 to 17.5', alias: ['hemoglobin', 'haemoglobin', 'hgb', 'hb'] }
}
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
export function generalRange(test: string, unit?: string): (Range & { text: string }) | null {
  const k = squash(test)
  const g = Object.values(GENERAL).find((x) => x.alias.includes(k))
  if (!g) return null
  const u = (unit ?? '').replace(/\s/g, '').replace(/[µμ]/g, 'u')
  return u && g.unit.test(u) ? { low: g.low, high: g.high, text: g.text } : null
}

const squashUnit = (u: string) => u.replace(/\s/g, '').replace(/[µμ]/g, 'u').toLowerCase()
export const MMOL_GLUCOSE = 18.016 // mmol/L -> mg/dL, the catalogue factor (migration 0008)
const GLUCOSE = new Set(['fasting_glucose', 'glucose', 'random_glucose'])
/** The reading in the unit its guide uses: glucose in mmol/L is converted to mg/dL (x 18.016), a reading with no unit is taken as it is, and a unit that
 *  cannot be compared (one that is neither the guide's nor a known conversion) gives null: such a reading is never judged and never averaged with the rest. */
export function toCanonicalReading<T extends Reading>(r: T): T | null {
  const g = GUIDE[r.test]
  const u = r.unit ? squashUnit(r.unit) : ''
  if (!u) return r
  if (g) {
    if (u === squashUnit(g.unit)) return r
    if (GLUCOSE.has(r.test) && g.unit === 'mg/dL' && /^mmol\/?l$/.test(u)) return { ...r, value: Math.round(r.value * MMOL_GLUCOSE * 10) / 10, unit: 'mg/dL', labLow: r.labLow == null ? r.labLow : r.labLow * MMOL_GLUCOSE, labHigh: r.labHigh == null ? r.labHigh : r.labHigh * MMOL_GLUCOSE }
    return null
  }
  if (GLUCOSE.has(r.test) && /^mmol\/?l$/.test(u)) return { ...r, value: Math.round(r.value * MMOL_GLUCOSE * 10) / 10, unit: 'mg/dL', labLow: r.labLow == null ? r.labLow : r.labLow * MMOL_GLUCOSE, labHigh: r.labHigh == null ? r.labHigh : r.labHigh * MMOL_GLUCOSE }
  return r
}

export function position(value: number, r?: { low?: number | null; high?: number | null }): Position {
  if (!r || (r.low == null && r.high == null)) return 'none'
  if (r.low != null && value < r.low) return 'below'
  if (r.high != null && value > r.high) return 'above'
  return 'within'
}

export const rangeText = (r?: { low?: number | null; high?: number | null }) =>
  !r || (r.low == null && r.high == null) ? '' : r.low == null ? `up to ${r.high}` : r.high == null ? `${r.low} or more` : `${r.low} to ${r.high}`

const WORD: Record<Position, string> = { within: 'Within range', below: 'Below range', above: 'Above range', none: '' }

/** Lab range first, general guide second, family threshold overrides both for the headline. */
export function latestVsNormal(reading: Reading, family?: Range) {
  const lab = { low: reading.labLow ?? null, high: reading.labHigh ?? null }
  const g = GUIDE[reading.test]
  const canon = toCanonicalReading(reading) // the guide and the family limit are in the guide's unit; the lab's own range is in the lab's unit
  const labPos = position(reading.value, lab)
  const guidePos = canon ? position(canon.value, g) : 'none'
  const famPos = canon ? position(canon.value, family) : 'none'
  const gen = g ? null : generalRange(reading.test, reading.unit)
  const genPos = position(reading.value, gen ?? undefined)
  const headline = famPos !== 'none' ? famPos : labPos !== 'none' ? labPos : guidePos !== 'none' ? guidePos : genPos
  return {
    headline,
    headlineText: WORD[headline],
    headlineFrom: famPos !== 'none' ? 'family' : labPos !== 'none' ? 'lab' : guidePos !== 'none' ? 'guide' : genPos !== 'none' ? 'general' : 'none',
    lab: { text: rangeText(lab), position: labPos },
    general: gen && genPos !== 'none' ? { text: gen.text, position: genPos } : null,
    guide: g ? { text: g.text, position: guidePos, source: g.source, url: g.url, year: g.year, label: GUIDE_LABEL } : null,
    family: family && famPos !== 'none' ? { text: rangeText(family), position: famPos } : null
  }
}

export function latestByTest(readings: Reading[]): Reading[] {
  const m = new Map<string, Reading>()
  for (const r of readings) {
    const cur = m.get(r.test)
    if (!cur || r.takenAt > cur.takenAt) m.set(r.test, r)
  }
  return [...m.values()].sort((a, b) => a.test.localeCompare(b.test))
}

export type RangeState = { kind: 'none' | 'within' | 'high' | 'low'; word: string; hidden: string }
/** What the status chip says. No range is its own state, never "Within range": a missing range must not look normal. */
export function rangeState(headline: Position, kind: VerdictKind = 'vital', bp?: { top?: number | null; bottom?: number | null }): RangeState {
  const v = verdictFor(kind, headline, bp)
  return headline === 'above' ? { kind: 'high', word: v!.word, hidden: 'Above range' }
    : headline === 'below' ? { kind: 'low', word: v!.word, hidden: 'Below range' }
    : headline === 'within' ? { kind: 'within', word: v!.word, hidden: '' }
    : { kind: 'none', word: 'No range', hidden: '' }
}
