import { positionOf } from './vitals'
import { GUIDE, type Position, type Range, type Reading } from './ranges'
import { verdictFor, bpLevel, BP_WORDS } from './verdict'
import { PLAUSIBLE as P } from './plausible'

/** The add-reading sheet: what a typed reading means, in colour and one plain line, before it is saved. Pure. */
export type EntryKind = 'bp' | 'single'
export interface EntrySpec { kind: EntryKind; code: string; label: string; unit: string; min: number; max: number }

const SPECS: Record<string, EntrySpec> = {
  bp: { kind: 'bp', code: 'bp_systolic', label: 'blood pressure', unit: 'mmHg', min: P.bp.min, max: P.bp.max },
  fasting_glucose: { kind: 'single', code: 'fasting_glucose', label: 'fasting sugar', unit: 'mg/dL', min: P.glucose.min, max: P.glucose.max },
  glucose: { kind: 'single', code: 'glucose', label: 'blood sugar', unit: 'mg/dL', min: P.glucose.min, max: P.glucose.max },
  weight: { kind: 'single', code: 'weight', label: 'weight', unit: 'kg', min: P.weight.min, max: P.weight.max },
  heart_rate: { kind: 'single', code: 'heart_rate', label: 'pulse', unit: 'bpm', min: P.pulse.min, max: P.pulse.max }
}
/** Device-only vitals (no add-sheet entry): the same preview; no colour when no guide range exists. */
const DEVICE: Record<string, EntrySpec> = {
  temperature: { kind: 'single', code: 'temperature', label: 'temperature', unit: 'C', min: P.temperature.min, max: P.temperature.max },
  spo2: { kind: 'single', code: 'spo2', label: 'oxygen', unit: '%', min: P.spo2.min, max: P.spo2.max }
}
/** null for steps, sleep, mood and unknown codes: they are not typed in here. */
export const entrySpec = (code: string): EntrySpec | null => SPECS[code === 'bp_systolic' || code === 'bp_diastolic' ? 'bp' : code] ?? null

export const deviceSpec = (code: string): EntrySpec | null => entrySpec(code) ?? DEVICE[code] ?? null

/** The readings that open the crisis card (same lines as the 0035 family alert, so the person and the family hear about the same readings): top 180 or more OR bottom 120 or more; sugar under 70 or over 300 mg/dL; oxygen under 90. Pass only numbers that passed the plausibility check. Needs clinician sign-off. */
export type Crisis = 'bp' | 'low_sugar' | 'high_sugar' | 'low_spo2'
export function crisisOf(code: string, v: { top?: number | null; bottom?: number | null; value?: number | null; unit?: string }): Crisis | null {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  if (code === 'bp' || code === 'bp_systolic' || code === 'bp_diastolic') return (ok(v.top) && v.top >= 180) || (ok(v.bottom) && v.bottom >= 120) ? 'bp' : null
  if (!ok(v.value)) return null
  if (code === 'glucose' || code === 'fasting_glucose') {
    const mg = v.unit && /^mmol/i.test(v.unit) ? v.value * 18 : v.value // same x18 as the 0035 trigger
    return mg < 70 ? 'low_sugar' : mg > 300 ? 'high_sugar' : null
  }
  return code === 'spo2' && v.value < 90 ? 'low_spo2' : null
}

export interface Preview { state: Position | 'invalid'; word: string; line: string }
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
const R = (test: string, value: number, unit: string): Reading => ({ personId: '', takenAt: '', test, value, unit })

export function previewReading(spec: EntrySpec, v: { top?: string; bottom?: string; pulse?: string; value?: string }, family?: Range | null): Preview {
  if (spec.kind === 'bp') {
    const s = num(v.top ?? '')
    const d = num(v.bottom ?? '')
    if (!Number.isFinite(s) || !Number.isFinite(d)) return { state: 'invalid', word: '', line: 'Type the top and the bottom number.' }
    if (s < spec.min || s > spec.max || d < 20 || d > 200) return { state: 'invalid', word: '', line: 'Check the numbers: they look too small or too big.' }
    if (d >= s) return { state: 'invalid', word: '', line: 'The top number is higher than the bottom one. Check them.' }
    if (crisisOf('bp', { top: s, bottom: d })) return { state: 'above', word: verdictFor('bp', 'above', { top: s, bottom: d })!.word, line: 'Very high. Check for warning signs now.' }
    const lv = bpLevel(s, d)!
    // a doctor's own target (family threshold) replaces the home words when both numbers are inside it
    if (family && lv !== 'low' && positionOf(R('bp_systolic', s, 'mmHg'), family) === 'within' && positionOf(R('bp_diastolic', d, 'mmHg')) === 'within') return { state: 'within', word: BP_WORDS.in.word, line: `Top under ${GUIDE.bp_systolic!.high! + 1} and bottom under ${GUIDE.bp_diastolic!.high! + 1}. Keep it up.` }
    const word = BP_WORDS[lv].word
    if (lv === 'low') return { state: 'below', word, line: 'Below the general guide. If you feel dizzy, sit down and tell your doctor.' }
    if (lv === 'in') return { state: 'within', word, line: `Top under ${GUIDE.bp_systolic!.high! + 1} and bottom under ${GUIDE.bp_diastolic!.high! + 1}. Keep it up.` }
    if (lv === 'raised') return { state: 'above', word, line: 'A little above the general guide. Rest for 5 minutes and measure again. Keep an eye on it.' }
    if (lv === 'above') return { state: 'above', word, line: 'Above the home target of under 130/80. Rest for 5 minutes and measure again. If it stays there, tell your doctor.' }
    return { state: 'above', word, line: 'High. Rest for 5 minutes and measure again. If it stays high, tell your doctor.' }
  }
  const x = num(v.value ?? '')
  if (!Number.isFinite(x)) return { state: 'invalid', word: '', line: `Type your ${spec.label}.` }
  if (x < spec.min || x > spec.max) return { state: 'invalid', word: '', line: 'Check the number: it looks too small or too big.' }
  if (spec.code === 'weight') return { state: 'none', word: '', line: 'Saved with the date, so you can see the weeks, not one day.' }
  const pos = positionOf(R(spec.code, x, spec.unit), family)
  const crisis = crisisOf(spec.code, { value: x })
  if (crisis === 'low_sugar') return { state: 'below', word: 'Low', line: 'Low sugar. Take 15 g of fast sugar now, then check again in 15 minutes.' }
  if (crisis === 'high_sugar') return { state: 'above', word: verdictFor('vital', 'above')!.word, line: 'Very high sugar. Drink water and call your doctor today.' }
  if (crisis === 'low_spo2') return { state: 'below', word: 'Low', line: 'Oxygen is low. Sit up, breathe slowly and check again in a minute.' }
  const g = GUIDE[spec.code] // the range text comes from the same guide that colours the reading
  const rt = g ? ` Usual: ${g.text}${g.unit === 'bpm' ? ' bpm' : ''}.` : ''
  return pos === 'within' ? { state: pos, word: verdictFor('vital', 'within')!.word, line: `In the usual range.${rt}` }
    : pos === 'above' ? { state: pos, word: verdictFor('vital', 'above')!.word, line: `Above the usual range.${rt} Tell your doctor if it keeps happening.` }
    : pos === 'below' ? { state: pos, word: 'Low', line: `Below the usual range.${rt} Tell your doctor if it keeps happening.` }
    : { state: 'none', word: '', line: 'Saved. There is no range to compare with.' }
}

/** Time chips: Now, Morning (7 AM) and Evening (7 PM) of today, or of yesterday when that hour has not come yet. */
export function chipTime(chip: 'now' | 'morning' | 'evening', now: Date): Date {
  if (chip === 'now') return new Date(now)
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), chip === 'morning' ? 7 : 19, 0)
  return at.getTime() > now.getTime() ? new Date(at.getTime() - 86_400_000) : at
}
