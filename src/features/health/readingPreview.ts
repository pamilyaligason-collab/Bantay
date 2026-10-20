import { positionOf } from './vitals'
import { rangeText, type Position, type Range, type Reading } from './ranges'

/** The add-reading sheet: what a typed reading means, in colour and one plain line, before it is saved. Pure. */
export type EntryKind = 'bp' | 'single'
export interface EntrySpec { kind: EntryKind; code: string; label: string; unit: string; min: number; max: number }

const SPECS: Record<string, EntrySpec> = {
  bp: { kind: 'bp', code: 'bp_systolic', label: 'blood pressure', unit: 'mmHg', min: 40, max: 300 },
  fasting_glucose: { kind: 'single', code: 'fasting_glucose', label: 'fasting sugar', unit: 'mg/dL', min: 20, max: 800 },
  glucose: { kind: 'single', code: 'glucose', label: 'blood sugar', unit: 'mg/dL', min: 20, max: 800 },
  weight: { kind: 'single', code: 'weight', label: 'weight', unit: 'kg', min: 2, max: 400 },
  heart_rate: { kind: 'single', code: 'heart_rate', label: 'pulse', unit: 'bpm', min: 20, max: 250 }
}
/** null for steps, sleep, mood and unknown codes: they are not typed in here. */
export const entrySpec = (code: string): EntrySpec | null => SPECS[code === 'bp_systolic' || code === 'bp_diastolic' ? 'bp' : code] ?? null

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
    if (s >= 180 || d >= 120) return { state: 'above', word: 'High', line: 'Very high. If you have a headache, chest pain or blurred vision, get help now. Otherwise rest and measure again.' }
    if (s < 90 || d < 60) return { state: 'below', word: 'A bit low', line: 'Below the general guide. If you feel dizzy, sit down and tell your doctor.' }
    const ps = [positionOf(R('bp_systolic', s, 'mmHg'), family), positionOf(R('bp_diastolic', d, 'mmHg'))]
    const st: Position = ps.includes('above') ? 'above' : ps.includes('below') ? 'below' : 'within'
    return st === 'within' ? { state: st, word: 'In range', line: 'Top under 120 and bottom under 80. Keep it up.' }
      : st === 'above' ? { state: st, word: 'A bit high', line: 'Above the general guide. Rest for 5 minutes and measure again. If it stays high, tell your doctor.' }
      : { state: st, word: 'A bit low', line: 'Below the general guide. If you feel dizzy, sit down and tell your doctor.' }
  }
  const x = num(v.value ?? '')
  if (!Number.isFinite(x)) return { state: 'invalid', word: '', line: `Type your ${spec.label}.` }
  if (x < spec.min || x > spec.max) return { state: 'invalid', word: '', line: 'Check the number: it looks too small or too big.' }
  if (spec.code === 'weight') return { state: 'none', word: '', line: 'Saved with the date, so you can see the weeks, not one day.' }
  const pos = positionOf(R(spec.code, x, spec.unit), family)
  const g = spec.code === 'heart_rate' ? { low: 60, high: 100 } : spec.code === 'glucose' ? null : { low: 70, high: 100 }
  const rt = g ? ` Usual: ${rangeText(g)} ${spec.unit}.` : ''
  return pos === 'within' ? { state: pos, word: 'In range', line: `In the usual range.${rt}` }
    : pos === 'above' ? { state: pos, word: 'A bit high', line: `Above the usual range.${rt} Tell your doctor if it keeps happening.` }
    : pos === 'below' ? { state: pos, word: 'A bit low', line: `Below the usual range.${rt} Tell your doctor if it keeps happening.` }
    : { state: 'none', word: '', line: 'Saved. There is no range to compare with.' }
}

/** Time chips: Now, Morning (7 AM) and Evening (7 PM) of today, or of yesterday when that hour has not come yet. */
export function chipTime(chip: 'now' | 'morning' | 'evening', now: Date): Date {
  if (chip === 'now') return new Date(now)
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), chip === 'morning' ? 7 : 19, 0)
  return at.getTime() > now.getTime() ? new Date(at.getTime() - 86_400_000) : at
}
