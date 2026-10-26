import type { Position } from './ranges'

/** ONE table of verdict words, used by every surface (KPIs, My week, body map, Vitals, Labs, member report, reading preview).
 *  Position (above / within / below) comes from readingPosition in model.ts, which reads guide-ranges.json (AHA/ACC 2017 for BP, ADA Standards of Care for fasting glucose; sources are in that file).
 *  For blood pressure with numbers, this module's own BP table (bpLevel) decides the word; the position is only the fallback when no number is passed. */
export type VerdictKind = 'bp' | 'vital' | 'lab'
export type BpLevel = 'in' | 'raised' | 'above' | 'high' | 'low'
export interface Verdict { word: string; icon: 'check' | 'up' | 'down'; level?: BpLevel }

export const RAISED_WORD = 'A little raised'
export const ABOVE_WORD = 'Above target'
/** THE blood pressure table (home thresholds, awaiting clinician sign-off; docs/session-8/CLINICAL-REVIEW.md "Session 10 safety"). The only place these numbers live.
 *  Low: top under 90 or bottom under 60. High: top 135 or more, or bottom 85 or more (ISH 2020 / ESH home). Above target: top 130 to 134, or bottom 80 to 84.
 *  A little raised: top 120 to 129 with the bottom under 80. In range: top under 120 and bottom under 80. Pass what you have; a missing number is skipped, never treated as 0. */
export const BP_WORDS: Record<BpLevel, Verdict> = {
  in: { word: 'In range', icon: 'check', level: 'in' },
  raised: { word: RAISED_WORD, icon: 'up', level: 'raised' },
  above: { word: ABOVE_WORD, icon: 'up', level: 'above' },
  high: { word: 'High', icon: 'up', level: 'high' },
  low: { word: 'Low', icon: 'down', level: 'low' }
}
export function bpLevel(top?: number | null, bottom?: number | null): BpLevel | null {
  const t = typeof top === 'number' && Number.isFinite(top) ? top : null
  const b = typeof bottom === 'number' && Number.isFinite(bottom) ? bottom : null
  if (t == null && b == null) return null
  if ((t != null && t < 90) || (b != null && b < 60)) return 'low'
  if ((t != null && t >= 135) || (b != null && b >= 85)) return 'high'
  if ((t != null && t >= 130) || (b != null && b >= 80)) return 'above'
  if (t != null && t >= 120) return 'raised'
  return 'in'
}
const WORDS: Record<VerdictKind, Record<Exclude<Position, 'none'>, Verdict>> = {
  bp: { above: { word: 'High', icon: 'up' }, below: { word: 'Low', icon: 'down' }, within: { word: 'In range', icon: 'check' } },
  vital: { above: { word: 'A bit high', icon: 'up' }, below: { word: 'Low', icon: 'down' }, within: { word: 'In range', icon: 'check' } },
  lab: { above: { word: 'High', icon: 'up' }, below: { word: 'Low', icon: 'down' }, within: { word: 'In range', icon: 'check' } }
}

/** The kind a test code is worded as: blood pressure, any other home vital (sugar, pulse), or a lab result. */
export function kindOf(test: string, isVital = true): VerdictKind {
  return test === 'bp_systolic' || test === 'bp_diastolic' || test === 'bp' ? 'bp' : isVital ? 'vital' : 'lab'
}

/** The word and icon for a position; null when there is no range (no verdict, never "In range"). For BP, pass BOTH the top and bottom numbers (one alone reads plain High) so 120 to 129 over under 80 reads "A little raised". */
export function verdictFor(kind: VerdictKind, pos: Position, bp?: { top?: number | null; bottom?: number | null }): Verdict | null {
  if (pos === 'none') return null
  const lv = kind === 'bp' ? bpLevel(bp?.top, bp?.bottom) : null
  if (lv) return BP_WORDS[lv]
  return WORDS[kind][pos]
}
