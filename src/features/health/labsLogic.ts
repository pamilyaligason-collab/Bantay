import { barLayout, effectiveRange, metricLabel, readingPosition } from './model'
import { GUIDE, generalRange, toCanonicalReading, type Position, type Range, type Reading } from './ranges'
import { providerName } from '../../lib/labFormat'
import type { DocBundle, SourceFile } from '../records/api'
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
export type CloserKind = 'in' | 'crossed' | 'same' | 'closer' | 'further'
/** Direction depends on the side of the range, not on up or down: 8.1 after 9.4 with a top limit of 7 is closer; 4.0 after 5.5 with a bottom limit of 5 is further. Null without a range. */
export function closerKind(latest: number, prev: number, range: Range | null): CloserKind | null {
  if (!range || (range.low == null && range.high == null)) return null
  const a = distance(latest, range)
  const b = distance(prev, range)
  if (a === 0 && b === 0) return 'in'
  const side = (v: number) => (range.low != null && v < range.low ? -1 : range.high != null && v > range.high ? 1 : 0)
  if (side(latest) * side(prev) < 0) return 'crossed'
  return a === b ? 'same' : a < b ? 'closer' : 'further'
}
const MOVE: Record<CloserKind, string> = { in: 'in the usual range both times', crossed: 'now on the other side of the usual range', same: 'no change from the one before', closer: 'toward the usual range', further: 'away from the usual range' }
export function moveWords(latest: number, prev: number, range: Range | null): string {
  const k = closerKind(latest, prev, range)
  return k ? MOVE[k] : ''
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

// ---- session 14 lane L: dated history, whose range, previous result, trend (mockup v8 health-labs, health-labdetail; D-9, D-38) ----
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2 Oct" or "2 Oct 2026" in the phone's local day (fixed order; ICU's en-PH puts the month first). '' for a date that cannot be read. */
export function labDate(iso: string, withYear = false): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso) // a plain document date is a calendar day, not a UTC instant
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MON[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`
}

export interface LabHistoryEntry { value: number; unit: string; date: string; sourceFileId?: string; labName?: string; range?: Range }
/** Every result of one test, newest first, each with its date, the paper it came from and the range printed on that paper. `labOf` names the lab from a source file id. */
export function labHistory(results: Reading[], testKey: string, labOf?: (sourceFileId: string) => string | undefined): LabHistoryEntry[] {
  return results
    .filter((r) => r.test === testKey && Number.isFinite(Date.parse(r.takenAt)) && typeof r.value === 'number' && Number.isFinite(r.value))
    .sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
    .map((r) => {
      const labName = r.sourceFileId ? labOf?.(r.sourceFileId) : undefined
      return {
        value: r.value, unit: r.unit ?? '', date: r.takenAt,
        ...(r.sourceFileId ? { sourceFileId: r.sourceFileId } : {}),
        ...(labName ? { labName } : {}),
        ...(r.labLow != null || r.labHigh != null ? { range: { low: r.labLow ?? null, high: r.labHigh ?? null } } : {})
      }
    })
}

const words = (r: Range) => (r.low != null && r.high != null ? `${labNum(r.low)} to ${labNum(r.high)}` : r.high != null ? `up to ${labNum(r.high)}` : `${labNum(r.low)} or more`)
export interface RangeSource { kind: 'lab' | 'guide' | 'doctor'; text: string }
/** Whose range a result is judged against, in one line that includes the numbers. The lab's own range printed on the paper comes first; a general guide names its source and year. Null when there is no range. */
export function rangeSource(r: Reading, family?: Range | null): RangeSource | null {
  const { range, from } = effectiveRange(r, family)
  if (!range || from === 'none') return null
  if (from === 'family') return { kind: 'doctor', text: `Your doctor's target ${words(range)}` }
  if (from === 'lab') return { kind: 'lab', text: `Lab range ${words(range)}` }
  if (from === 'guide') { const g = GUIDE[r.test]!; return { kind: 'guide', text: `General guide (${g.source}, ${g.year}): ${g.text}` } }
  return { kind: 'guide', text: `General guide (typical adults, labs differ): ${generalRange(r.test, r.unit)!.text}` }
}

export interface PreviousResult { value: number; unit: string; date: string; direction: 'up' | 'down' | 'same'; change: number; kind: CloserKind | null; prevAt: number | null; line: string }
/** D-38: the result before the latest, in the same unit. `prevAt` is its value in the range's unit (for the hollow mark). Null when there is no earlier result in that unit. */
export function previousResult(readings: Reading[], test: string, family?: Range | null): PreviousResult | null {
  const all = readings.filter((r) => r.test === test && Number.isFinite(Date.parse(r.takenAt)) && Number.isFinite(r.value)).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const latest = all[0]
  const unit = (latest?.unit ?? '').trim().toLowerCase()
  const prev = all.slice(1).find((r) => (r.unit ?? '').trim().toLowerCase() === unit)
  if (!latest || !prev) return null
  const change = Math.round((latest.value - prev.value) * 100) / 100
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same'
  const a = rangeValue(latest, family)
  const b = rangeValue(prev, family)
  const kind = a && b ? closerKind(a.value, b.value, effectiveRange(latest, family).range) : null
  const tail = kind === 'closer' ? ' · closer to the range' : kind === 'further' ? ' · further from the range' : kind === 'in' ? ' · in the range both times' : kind === 'crossed' ? ' · now on the other side of the range' : ''
  const u = prev.unit ? ` ${prev.unit}` : ''
  const line = `Before: ${labNum(prev.value)}${u} on ${labDate(prev.takenAt)} · ${direction === 'same' ? 'no change' : `${direction} ${labNum(Math.abs(change))}`}${tail}`
  return { value: prev.value, unit: prev.unit ?? '', date: prev.takenAt, direction, change, kind, prevAt: b ? b.value : null, line }
}

/** "going down", "going up" or "steady" from the oldest to the newest of the shown results (newest first). '' with fewer than two. */
export function trendOfLastThree(items: { value: number }[]): string {
  if (items.length < 2) return ''
  const d = items[0]!.value - items[items.length - 1]!.value
  return d < 0 ? 'going down' : d > 0 ? 'going up' : 'steady'
}

export interface LabSource { facility: string; docDate: string | null; file: SourceFile }
/** Source file id -> the paper it came from (lab name, date, the file to open), from the confirmed documents. */
export function sourceIndex(docs: DocBundle[]): Map<string, LabSource> {
  const m = new Map<string, LabSource>()
  for (const b of docs) for (const file of b.files) m.set(file.id, { facility: providerName(b.doc.facility), docDate: b.doc.doc_date, file })
  return m
}
