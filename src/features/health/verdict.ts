import type { Position } from './ranges'

/** ONE table of verdict words, used by every surface (KPIs, My week, body map, Vitals, Labs, member report, reading preview).
 *  Position (above / within / below) comes from readingPosition in model.ts, which reads guide-ranges.json (AHA/ACC 2017 for BP, ADA Standards of Care for fasting glucose; sources are in that file).
 *  This module adds no thresholds of its own except the BP "little raised" band, which is the one the Normal text already states: 120 to 129 on top with the bottom under 80 (AHA/ACC 2017 "elevated"). */
export type VerdictKind = 'bp' | 'vital' | 'lab'
export interface Verdict { word: string; icon: 'check' | 'up' | 'down' }

export const RAISED_WORD = 'A little raised'
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
  if (kind === 'bp' && pos === 'above' && typeof bp?.top === 'number' && typeof bp.bottom === 'number' && bp.top < 130 && bp.bottom < 80) return { word: RAISED_WORD, icon: 'up' }
  return WORDS[kind][pos]
}
