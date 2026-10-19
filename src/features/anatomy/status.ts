import { readingPosition } from '../health/model'
import type { Position, Range, Reading } from '../health/ranges'

/** Glow on the body: amber when a result is above or below range, green when within, none when unknown (never green for "no range"). */
export type Tone = 'warn' | 'ok' | 'none'
export const hotspotTone = (state: Position, empty = false): Tone => (empty ? 'none' : state === 'within' ? 'ok' : state === 'above' || state === 'below' ? 'warn' : 'none')

// Which body system a lab or vital belongs to, by test key. Unmapped keys count nowhere.
const SYSTEM_TESTS: [string, RegExp][] = [
  ['kidneys', /creatinine|egfr|^bun$|urea|uric/],
  ['digestion', /^(alt|ast|alp|ggt)$|bilirubin|albumin|liver/],
  ['hormones', /glucose|hba1c|^t[34]$|tsh|thyroid|insulin/],
  ['lungs', /spo2|oxygen|^o2/],
  ['heart', /^bp_|heart_rate|pulse|cholesterol|^ldl$|^hdl$|triglycer|hemoglobin|^rbc$|^wbc$|platelet|hematocrit/],
  ['skeleton', /calcium|vitamin_d|phosph/]
]
export const systemOf = (test: string): string | null => SYSTEM_TESTS.find(([, re]) => re.test(test.toLowerCase()))?.[0] ?? null

export interface SystemCount { total: number; flagged: number; ok: number }
/** Latest results per body system: how many, how many are above or below range, how many are within it. */
export function systemCounts(latest: Reading[], familyOf: (r: Reading) => Range | undefined = () => undefined): Record<string, SystemCount> {
  const out: Record<string, SystemCount> = {}
  const bp: Tone[] = [] // systolic and diastolic are one blood pressure reading: counted once below
  for (const r of latest) {
    const sys = systemOf(r.test)
    if (!sys) continue
    const t = hotspotTone(readingPosition(r, familyOf(r)))
    if (/^bp_/.test(r.test.toLowerCase())) { bp.push(t); continue }
    const c = (out[sys] ??= { total: 0, flagged: 0, ok: 0 })
    c.total++
    if (t === 'warn') c.flagged++
    else if (t === 'ok') c.ok++
  }
  if (bp.length) {
    const c = (out.heart ??= { total: 0, flagged: 0, ok: 0 })
    c.total++
    if (bp.includes('warn')) c.flagged++
    else if (bp.includes('ok')) c.ok++
  }
  return out
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** Tone and words for the status pill of one system. Unknown stays unknown: no range means no green. */
export function systemStatus(c: SystemCount): { tone: Tone; text: string } | null {
  if (c.flagged > 0) return { tone: 'warn', text: `${plural(c.flagged, 'result')} to look at` }
  if (c.ok > 0) return { tone: 'ok', text: `${plural(c.ok, 'result')} in range` }
  if (c.total > 0) return { tone: 'none', text: `${plural(c.total, 'result')}, no range to compare` }
  return null
}


