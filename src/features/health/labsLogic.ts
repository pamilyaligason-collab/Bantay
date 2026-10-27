import { barLayout, effectiveRange, metricLabel, readingPosition } from './model'
import { toCanonicalReading, type Position, type Range, type Reading } from './ranges'
import { verdictFor } from './verdict'
import type { IconName } from '../shell/Icon'

/** Pure logic for the lab results list and detail page (session 8). No React, no storage. Unknown is null, never 0. */

export interface LabVerdict { word: string; icon: IconName; pos: Position }
/** A plain word plus an icon, never colour alone. No range gives no verdict (null), never "In range". */
export function labVerdict(pos: Position): LabVerdict | null {
  const v = verdictFor('lab', pos)
  return v ? { ...v, pos } : null
}

export interface LabBand {
  band: { from: number; to: number }
  you: number // 0..100, clamped inside the track
  edge: 'high' | 'low' | null // value is off the end of the track
  lowAt: number | null // where the labelled low edge sits, null when the range has no low limit
  highAt: number | null
}
/** Band geometry for one value. A value outside the range clamps to the track end; a missing low or high leaves that edge unlabelled; no range gives null (no band). */
export function labBand(value: number, range: Range | null): LabBand | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const l = barLayout(value, null, range)
  if (!l.band) return null
  return { band: l.band, you: l.now, edge: l.edge, lowAt: range?.low != null ? l.band.from : null, highAt: range?.high != null ? l.band.to : null }
}

/** The value and unit the effective range is written in: the lab's own and the general range use the reading as is; guide and family limits use the guide's unit (as readingPosition does). Null when it cannot be compared. */
export function rangeValue(r: Reading, family?: Range | null): { value: number; unit: string } | null {
  const from = effectiveRange(r, family).from
  const c = from === 'lab' || from === 'general' ? r : toCanonicalReading(r)
  return c ? { value: c.value, unit: c.unit ?? '' } : null
}

/** unitGap: a range exists but in a unit this reading cannot be converted to (e.g. lipids in mmol/L vs a mg/dL guide). */
export interface LabRow { reading: Reading; range: Range | null; pos: Position; rv: { value: number; unit: string } | null; unitGap: boolean }
/** One lab value judged against the effective range (family, lab, guide, general). An unknown position has no range, so no band is drawn. */
export function labRow(r: Reading, family?: Range | null): LabRow {
  const pos = readingPosition(r, family)
  const range = effectiveRange(r, family).range
  return { reading: r, range: pos === 'none' ? null : range, pos, rv: pos === 'none' ? null : rangeValue(r, family), unitGap: pos === 'none' && !!range }
}

export interface LabGroups { ask: LabRow[]; usual: LabRow[]; noRange: LabRow[] }
/** "Ask about" (out of range) first, then "In the usual range", then those with no range on the paper. */
export function groupLabs(rows: LabRow[]): LabGroups {
  const byName = (a: LabRow, b: LabRow) => metricLabel(a.reading.test).localeCompare(metricLabel(b.reading.test))
  return {
    ask: rows.filter((x) => x.pos === 'above' || x.pos === 'below').sort(byName),
    usual: rows.filter((x) => x.pos === 'within').sort(byName),
    noRange: rows.filter((x) => x.pos === 'none').sort(byName)
  }
}

/** One decimal for a lab value on the list: 226.74 -> "226.7", 3.10 -> "3.1", 12 -> "12"; under 1 keeps two significant digits (0.72, 0.004). Unknown is '' never 0. */
export function labNum(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return String(Number(Math.abs(value) >= 1 ? value.toFixed(1) : value.toPrecision(2)))
}

const PANELS: [string, string[]][] = [
  ['Cholesterol', ['ldl', 'hdl', 'totalcholesterol', 'cholesterol', 'triglycerides', 'vldl', 'ldlcholesterol', 'hdlcholesterol']],
  ['Sugar', ['hba1c', 'fastingglucose', 'glucose', 'fbs', 'rbs']],
  ['Kidney', ['egfr', 'creatinine', 'crea', 'bun', 'urea', 'uricacid']],
  ['Blood count', ['hemoglobin', 'haemoglobin', 'hgb', 'hematocrit', 'hct', 'platelets', 'platelet', 'plt', 'wbc', 'rbc', 'mcv', 'mch', 'mchc', 'rdw', 'mpv']],
  ['Liver', ['alt', 'ast', 'alp', 'ggt', 'bilirubin', 'sgpt', 'sgot', 'albumin']]
]
export const OTHER_PANEL = 'Other'
/** The group a lab belongs to on the list (Cholesterol, Sugar, Kidney, Blood count, Liver, else Other). */
export function panelOf(test: string): string {
  const k = test.toLowerCase().replace(/[^a-z0-9]/g, '')
  return PANELS.find(([, names]) => names.includes(k))?.[0] ?? OTHER_PANEL
}
/** Rows grouped by panel in a fixed order (Other last), each group sorted by name. Empty panels are left out. */
export function groupByPanel(rows: LabRow[]): { panel: string; rows: LabRow[] }[] {
  const byName = (a: LabRow, b: LabRow) => metricLabel(a.reading.test).localeCompare(metricLabel(b.reading.test))
  return [...PANELS.map(([n]) => n), OTHER_PANEL].map((panel) => ({ panel, rows: rows.filter((r) => panelOf(r.reading.test) === panel).sort(byName) })).filter((g) => g.rows.length > 0)
}

const distance = (v: number, r: Range) => (r.low != null && v < r.low ? r.low - v : r.high != null && v > r.high ? v - r.high : 0)
/** Direction depends on the side of the range, not on up or down: 8.1 after 9.4 with a top limit of 7 is "toward"; 4.0 after 5.5 with a bottom limit of 5 is "away". */
export function moveWords(latest: number, prev: number, range: Range | null): string {
  if (!range || (range.low == null && range.high == null)) return ''
  const a = distance(latest, range)
  const b = distance(prev, range)
  if (a === 0 && b === 0) return 'in the usual range both times'
  const side = (v: number) => (range.low != null && v < range.low ? -1 : range.high != null && v > range.high ? 1 : 0)
  if (side(latest) * side(prev) < 0) return 'now on the other side of the usual range'
  if (a === b) return 'no change from the one before'
  return a < b ? 'toward the usual range' : 'away from the usual range'
}

export interface LabHistoryItem { takenAt: string; value: number; unit: string; pos: Position; move: string }
/** Newest three results of one test in the latest result's unit, each with where it sat and how it moved from the one before it. */
export function lastThree(readings: Reading[], test: string, family?: Range | null): LabHistoryItem[] {
  const all = readings.filter((r) => r.test === test && Number.isFinite(Date.parse(r.takenAt)) && Number.isFinite(r.value)).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const unit = (all[0]?.unit ?? '').trim().toLowerCase()
  const same = all.filter((r) => (r.unit ?? '').trim().toLowerCase() === unit)
  return same.slice(0, 3).map((r, i) => {
    const prev = same[i + 1]
    const a = rangeValue(r, family)
    const b = prev ? rangeValue(prev, family) : null
    return { takenAt: r.takenAt, value: r.value, unit: r.unit ?? '', pos: readingPosition(r, family), move: a && b ? moveWords(a.value, b.value, effectiveRange(r, family).range) : '' }
  })
}

// ---- static text: what a test measures and questions to ask. FOR CLINICIAN REVIEW (docs/session-8/CLINICAL-REVIEW.md). ----
// Plain-language wording follows MedlinePlus lab-test pages (https://medlineplus.gov/lab-tests/); nothing here diagnoses.
export interface LabInfo { measures: string; questions: string[] }
const INFO: Record<string, LabInfo> = {
  ldl: { measures: 'LDL is the cholesterol that can build up in the walls of blood vessels.', questions: ['Is my LDL where you want it for me?', 'Should I change what I eat, or my medicines, because of this?'] },
  hdl: { measures: 'HDL is the cholesterol that helps carry other cholesterol away from the blood.', questions: ['Is my HDL a concern for me?', 'Would more walking or activity help?'] },
  total_cholesterol: { measures: 'Total cholesterol adds up the different kinds of cholesterol in your blood.', questions: ['What should my cholesterol numbers be for me?', 'When should I have this checked again?'] },
  triglycerides: { measures: 'Triglycerides are a type of fat in the blood. Eating before the test can raise them.', questions: ['Was this test taken fasting, and does that matter?', 'What could lower my triglycerides?'] },
  hba1c: { measures: 'HbA1c shows your average blood sugar over about the last three months.', questions: ['What HbA1c should I aim for?', 'Do my medicines or meals need to change?'] },
  fasting_glucose: { measures: 'Fasting glucose is the sugar in your blood after not eating for several hours.', questions: ['Is my fasting sugar where you want it?', 'How often should I check at home?'] },
  egfr: { measures: 'eGFR is an estimate of how well your kidneys are filtering your blood.', questions: ['What does my kidney score mean for me?', 'Are any of my medicines a concern for my kidneys?'] },
  creatinine: { measures: 'Creatinine is a waste product that the kidneys remove from the blood.', questions: ['Is my creatinine a concern for my kidneys?', 'Should I drink more water, or take anything differently?'] },
  hemoglobin: { measures: 'Hemoglobin is the part of red blood cells that carries oxygen around the body.', questions: ['Could my hemoglobin be why I feel tired?', 'Do I need any other test to find the reason?'] },
  platelets: { measures: 'Platelets are small blood cells that help the blood to clot.', questions: ['Is my platelet count a concern for me?', 'Should I avoid any medicines because of it?'] },
  wbc: { measures: 'White blood cells help the body fight infection.', questions: ['Is my white blood cell count a concern for me?', 'Should this be repeated, and when?'] },
  uric_acid: { measures: 'Uric acid is a waste product. Too much can collect in joints.', questions: ['Is my uric acid a concern for my joints or kidneys?', 'Are there foods I should limit?'] }
}
const ALIAS: Record<string, string> = { hdlcholesterol: 'hdl', ldlcholesterol: 'ldl', cholesterol: 'total_cholesterol', totalcholesterol: 'total_cholesterol', glucose: 'fasting_glucose', fbs: 'fasting_glucose', hgb: 'hemoglobin', haemoglobin: 'hemoglobin', plt: 'platelets', platelet: 'platelets', whitebloodcell: 'wbc', uricacid: 'uric_acid', crea: 'creatinine' }
const NEUTRAL: LabInfo = { measures: 'A test from your lab results. Your doctor can explain what it shows for you.', questions: ['What does this result mean for me?', 'Do I need to do anything about it, or repeat the test?'] }
export function labInfo(test: string): LabInfo & { known: boolean } {
  const t = test.toLowerCase()
  const hit = INFO[t] ?? INFO[ALIAS[t.replace(/[^a-z0-9]/g, '')] ?? '']
  return hit ? { ...hit, known: true } : { ...NEUTRAL, known: false }
}
