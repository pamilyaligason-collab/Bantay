/** Self-care breathing (pure): patterns, session length and where in a breath we are. No timers, no storage. */
export type Phase = 'in' | 'hold' | 'out' | 'rest'
export interface Pattern { id: 'relax' | 'sleep' | 'calm'; name: string; tag: string; steps: { phase: Phase; secs: number }[]; why: string; source: string; sourceUrl: string }

/** Sources are public; the wording is listed in docs/session-8/CLINICAL-REVIEW.md for a clinician to check. */
export const PATTERNS: Pattern[] = [
  { id: 'relax', name: 'Relax', tag: 'In 4, out 6', steps: [{ phase: 'in', secs: 4 }, { phase: 'out', secs: 6 }],
    why: 'A slow breath out, about six breaths a minute, helps the body settle.',
    source: 'Russo, Santarelli, O\'Rourke. The physiology of slow breathing. Breathe 2017', sourceUrl: 'https://doi.org/10.1183/20734735.009817' },
  { id: 'sleep', name: 'Sleep', tag: 'In 4, hold 7, out 8', steps: [{ phase: 'in', secs: 4 }, { phase: 'hold', secs: 7 }, { phase: 'out', secs: 8 }],
    why: 'The 4-7-8 breath is a popular wind-down habit. It is not a treatment, and studies of it are small.',
    source: 'Dr Andrew Weil, the 4-7-8 breathing exercise', sourceUrl: 'https://www.drweil.com/health-wellness/body-mind-spirit/stress-anxiety/breathing-three-exercises/' },
  { id: 'calm', name: 'Calm', tag: 'Box: 4-4-4-4', steps: [{ phase: 'in', secs: 4 }, { phase: 'hold', secs: 4 }, { phase: 'out', secs: 4 }, { phase: 'rest', secs: 4 }],
    why: 'Equal counts in, hold, out and rest. An easy rhythm to follow when you feel tense.',
    source: 'Harvard Health, Relaxation techniques: breath control helps quell errant stress response', sourceUrl: 'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' }
]
// shortcut: 4-7-8 stays hidden (a 7 s hold for hypertensive seniors needs a clinician), flip to true after the clinician gate (session 10 Task 17).
export const SLEEP_478_ENABLED = false
/** The patterns the card offers. */
export const SHOWN_PATTERNS = PATTERNS.filter((p) => p.id !== 'sleep' || SLEEP_478_ENABLED)
export const MINUTES =[1, 3, 5] as const
export const PHASE_WORD: Record<Phase, string> = { in: 'Breathe in', hold: 'Hold gently', out: 'Breathe out', rest: 'Rest' }
export const SAFETY = 'Stop and breathe normally if you feel dizzy or short of breath. Chest pain is an emergency: use SOS.'

export const cycleSecs = (p: Pattern) => p.steps.reduce((n, s) => n + s.secs, 0)
/** Whole breaths that fit in the minutes, at least one. A breath is never cut off half way. */
export const cyclesFor = (p: Pattern, minutes: number) => Math.max(1, Math.round((minutes * 60) / cycleSecs(p)))
export const totalSecs = (p: Pattern, minutes: number) => cyclesFor(p, minutes) * cycleSecs(p)

export interface Moment { done: boolean; phase: Phase; left: number; secs: number; into: number; cycle: number }
/** Where we are `elapsed` seconds into a session. `left` counts down whole seconds in this phase (4,3,2,1); `into` is 0..1 through it. */
export function momentAt(p: Pattern, minutes: number, elapsed: number): Moment {
  const total = totalSecs(p, minutes)
  const last = p.steps[p.steps.length - 1]!
  if (!(elapsed >= 0)) elapsed = 0
  if (elapsed >= total) return { done: true, phase: last.phase, left: 0, secs: last.secs, into: 1, cycle: cyclesFor(p, minutes) }
  let t = elapsed % cycleSecs(p)
  for (const s of p.steps) {
    if (t < s.secs) return { done: false, phase: s.phase, left: Math.ceil(s.secs - t), secs: s.secs, into: t / s.secs, cycle: Math.floor(elapsed / cycleSecs(p)) + 1 }
    t -= s.secs
  }
  return { done: false, phase: 'in', left: p.steps[0]!.secs, secs: p.steps[0]!.secs, into: 0, cycle: 1 }
}

/** Circle size 0.55..1: grows through "in", stays big on a hold after "in", shrinks through "out", stays small on "rest". */
export function circleScale(m: Moment, prev: Phase | null): number {
  if (m.phase === 'in') return 0.55 + 0.45 * m.into
  if (m.phase === 'out') return 1 - 0.45 * m.into
  return m.phase === 'rest' || prev === 'out' ? 0.55 : 1
}

export const MOODS = [
  { v: 1, emoji: '😞', word: 'Low' }, { v: 2, emoji: '🙁', word: 'Down' }, { v: 3, emoji: '😐', word: 'Okay' },
  { v: 4, emoji: '🙂', word: 'Good' }, { v: 5, emoji: '😊', word: 'Great' }
] as const
export interface SelfCareEntry { at: string; pattern: Pattern['id']; minutes: number; mood: number | null }
/** Keeps the newest 60 and only valid fields: the log lives in this phone's storage and is never sent anywhere. */
export function addEntry(log: unknown, e: SelfCareEntry): SelfCareEntry[] {
  const old = Array.isArray(log) ? (log as SelfCareEntry[]).filter((x) => x && typeof x.at === 'string' && typeof x.minutes === 'number') : []
  return [...old, { ...e, mood: typeof e.mood === 'number' && e.mood >= 1 && e.mood <= 5 ? e.mood : null }].slice(-60)
}
