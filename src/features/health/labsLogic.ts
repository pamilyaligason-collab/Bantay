import { barLayout, effectiveRange, metricLabel, readingPosition } from './model'
import { GUIDE, generalRange, toCanonicalReading, type Position, type Range, type Reading } from './ranges'
import { providerName } from '../../lib/labFormat'
import type { DocBundle, SourceFile } from '../records/api'
import { verdictFor } from './verdict'
import type { IconName } from '../shell/Icon'
import { useEffect, useSyncExternalStore } from 'react'
import type { LabEntry } from './labGlossary'

/** Logic for the lab results list and detail page (session 8). Pure except the lab glossary loader (a lazy import, plus an idle prefetch at module load) and its useLabGlossary hook. No storage. Unknown is null, never 0. */

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

/** Where a value sits outside a range: the one source for plainWords and gapWords. Null inside, without a range, or for a non-number. times is null when the top limit is 0 (no ratio to speak of). */
function outside(value: number, range: Range | null): { over: boolean; near: boolean; times: number | null } | null {
  if (!range || !Number.isFinite(value)) return null
  if (range.high != null && value > range.high) { const t = range.high > 0 ? value / range.high : null; return { over: true, near: t != null && t < 1.5, times: t == null ? null : Math.round(t) } }
  if (range.low != null && value < range.low) { const t = value > 0 ? range.low / value : null; return { over: false, near: t != null && t < 1.5, times: null } }
  return null
}

/** One plain sentence on where a value sits against the usual range. '' without a range (never a guess). `value` is judged against the range; `shown` is the number printed (the reading as the person sees it, which may be in another unit). */
export function plainWords(value: number, range: Range | null, shown: string = labNum(value)): string {
  if (!range || !Number.isFinite(value)) return ''
  const o = outside(value, range)
  if (o?.over) return o.times == null ? `${shown} is over the top of normal.` : o.near ? `${shown} is a little over the top of normal.` : `${shown} is about ${o.times} times the top of normal.`
  if (o) return `${shown} is ${o.near ? 'a little' : 'well'} under the bottom of normal.`
  return range.low == null && range.high == null ? '' : `${shown} is inside the normal range.`
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

// ---- static text: what a test is and questions to ask. Comes from the one lab glossary (labGlossary.ts, MedlinePlus, FOR CLINICIAN REVIEW); nothing here diagnoses. ----
// The glossary (~9 KB gz of wording) is its own chunk: loaded once, on the first lab screen or at idle, never in the main bundle. Until it is in, a test reads as unknown (neutral text), never a guess.
type Glossary = typeof import('./labGlossary')
let glossary: Glossary | null = null
let pending: Promise<Glossary> | null = null
const subs = new Set<() => void>()
/** Fetch the lab glossary chunk once. Resolves with the module; a failed fetch is retried on the next call. */
export function loadLabGlossary(): Promise<Glossary> {
  pending ??= import('./labGlossary').then((m) => { glossary = m; subs.forEach((f) => f()); return m }, (e) => { pending = null; throw e })
  return pending
}
/** The glossary once loaded, else null. Starts the load. */
export function labGlossaryNow(): Glossary | null {
  if (!glossary) void loadLabGlossary().catch(() => undefined)
  return glossary
}
/** React: the glossary module, or null while it loads (render the existing Loading... style). Re-renders when it arrives. */
export function useLabGlossary(): Glossary | null {
  const g = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => glossary, () => null)
  useEffect(() => { if (!g) void loadLabGlossary().catch(() => undefined) }, [g])
  return g
}
if (typeof setTimeout === 'function') setTimeout(() => { void loadLabGlossary().catch(() => undefined) }, 0) // idle prefetch so sync callers (lab detail, list, report) find it ready
const labEntry = (test: string): LabEntry | null => labGlossaryNow()?.labEntry(test) ?? null

export interface LabInfo { measures: string; short: string; questions: string[] }
const NEUTRAL: LabInfo = { short: 'A test from your lab results', measures: 'A test from your lab results. Your doctor can explain what it shows for you.', questions: ['What does this result mean for me?', 'Do I need to do anything about it, or repeat the test?'] }
export function labInfo(test: string): LabInfo & { known: boolean; entry: LabEntry | null } {
  const e = labEntry(test)
  return e ? { short: e.short, measures: e.what, questions: e.ask, known: true, entry: e } : { ...NEUTRAL, known: false, entry: null }
}

/** How far outside the range, in the words of plainWords but without the number: "about 2x the top of normal". '' in range or without a range. */
export function gapWords(row: LabRow): string {
  const o = row.rv ? outside(row.rv.value, row.range) : null
  if (!o) return ''
  if (o.over) return o.times == null ? 'over the top of normal' : o.near ? 'a little over the top of normal' : `about ${o.times}× the top of normal`
  return o.near ? 'a little under the bottom of normal' : 'well under the bottom of normal'
}
/** The one short line under a test on the Health "needs attention" card: what it is, then how far out. "Liver enzyme · about 2x the top of normal". '' for a test the glossary does not know. */
export function attentionLine(row: LabRow): string {
  const e = labEntry(row.reading.test)
  return e ? [e.organ, gapWords(row)].filter(Boolean).join(' · ') : ''
}

// ---- session 14 lane L: dated history, whose range, previous result, trend (mockup v8 health-labs, health-labdetail; D-9, D-38) ----
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2 Oct" or "2 Oct 2026" in the phone's local day (fixed order; ICU's en-PH puts the month first). '' for a date that cannot be read. */
export function labDate(iso: string, withYear = false): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso) // a plain document date is a calendar day, not a UTC instant
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MON[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`
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

/** How far a value sits outside its range, as a fraction: (value - high) / (high - low) above, (low - value) / (high - low) below. A one-sided range uses the known edge itself. Null in range, without a range, or when the edge is 0 (never a made-up size). */
export function overBy(row: LabRow): number | null {
  const { range, rv, pos } = row
  if (!range || !rv || (pos !== 'above' && pos !== 'below')) return null
  const edge = pos === 'above' ? range.high : range.low
  if (edge == null) return null
  const width = range.low != null && range.high != null ? range.high - range.low : Math.abs(edge)
  return width > 0 ? Math.abs(rv.value - edge) / width : null
}

export interface LabSource { facility: string; docDate: string | null; file: SourceFile }
/** Source file id -> the paper it came from (lab name, date, the file to open), from the confirmed documents. */
export function sourceIndex(docs: DocBundle[]): Map<string, LabSource> {
  const m = new Map<string, LabSource>()
  for (const b of docs) for (const file of b.files) m.set(file.id, { facility: providerName(b.doc.facility), docDate: b.doc.doc_date, file })
  return m
}
