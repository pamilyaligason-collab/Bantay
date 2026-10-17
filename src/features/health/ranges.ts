import guide from '../../data/guide-ranges.json'

export interface Range {
  low: number | null
  high: number | null
}
export interface Reading {
  id?: number
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
  const labPos = position(reading.value, lab)
  const guidePos = position(reading.value, g)
  const famPos = position(reading.value, family)
  const headline = famPos !== 'none' ? famPos : labPos !== 'none' ? labPos : guidePos
  return {
    headline,
    headlineText: WORD[headline],
    headlineFrom: famPos !== 'none' ? 'family' : labPos !== 'none' ? 'lab' : guidePos !== 'none' ? 'guide' : 'none',
    lab: { text: rangeText(lab), position: labPos },
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
