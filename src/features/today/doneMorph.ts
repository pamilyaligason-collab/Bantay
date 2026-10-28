import { dayKey } from '../discover/play/score' // the contract's local-day helper (ML-38)

/** Dose card done-morph (session 13): the button shows "Taken h:mm" for MORPH_MS, then the card collapses (COLLAPSE_MS, or a FADE_MS cross-fade under reduced motion). */
export const MORPH_MS = 600
export const COLLAPSE_MS = 240
export const FADE_MS = 150

export const takenLabel = (d: Date) => `Taken ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
export const leaveMs = (reduced: boolean) => (reduced ? FADE_MS : COLLAPSE_MS)

/** True when `since` (the local day Today first drew My week, "YYYY-MM-DD") is under 7 local days before `now`. Unknown is false, never "first week". */
export function inFirstWeek(since: string | null | undefined, now: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since ?? '')
  if (!m) return false
  const a = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)
  const [y, mo, d] = dayKey(now).split('-').map(Number)
  const days = Math.round((Date.UTC(y!, mo! - 1, d!) - a) / 86_400_000)
  return days >= 0 && days < 7
}
