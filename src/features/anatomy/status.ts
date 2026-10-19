import { readingPosition } from '../health/model'
import type { Position, Range, Reading } from '../health/ranges'

/** Glow on the body: amber when a result is above or below range, green when within, none when unknown (never green for "no range"). */
export type Tone = 'warn' | 'ok' | 'none'
export const hotspotTone = (state: Position, empty = false): Tone => (empty ? 'none' : state === 'within' ? 'ok' : state === 'above' || state === 'below' ? 'warn' : 'none')

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
/** One calm sentence for the body map. Unknown values never count as steady. */
export function mapHeadline(nodes: { state: Position; empty: boolean }[]): string {
  const tones = nodes.map((n) => hotspotTone(n.state, n.empty))
  const flagged = tones.filter((t) => t === 'warn').length
  if (flagged > 0) return `${WORDS[flagged] ?? flagged} result${flagged === 1 ? '' : 's'} need${flagged === 1 ? 's' : ''} a look`
  if (tones.includes('ok')) return 'Your numbers look steady'
  return nodes.some((n) => !n.empty) ? 'Your latest numbers are in' : 'Nothing to show yet'
}

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
  for (const r of latest) {
    const sys = systemOf(r.test)
    if (!sys) continue
    const c = (out[sys] ??= { total: 0, flagged: 0, ok: 0 })
    c.total++
    const t = hotspotTone(readingPosition(r, familyOf(r)))
    if (t === 'warn') c.flagged++
    else if (t === 'ok') c.ok++
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


