/** Reply to a reminder with a reading: "128/82", "128 / 82 pulse 70", "bp 128" (asks), anything else is null and never saved.
 *  Pure. parseReading only reads the words; replyValid is the gate that decides whether the numbers may be saved (the notification handler checks it, a bad one opens the app instead). */
export type Parsed = { sys: number; dia: number; pulse?: number } | { ask: string } | null

/** Top 50-300, bottom 30-200, the top above the bottom; pulse 20-250 when given (same bounds as plausible.ts for pulse). */
export const REPLY_TOP = { min: 50, max: 300 }
export const REPLY_BOTTOM = { min: 30, max: 200 }
export const REPLY_PULSE = { min: 20, max: 250 }

const PULSE = /(?:\b(?:pulse|pr|hr|bpm)\s*[:=]?\s*(\d{2,3})\b)|(?:\b(\d{2,3})\s*bpm\b)/
const LEAD = /^(?:my\s+)?(?:bp|blood\s+pressure)(?:\s+is)?\s*[:=]?\s*/

export function parseReading(text: string): Parsed {
  let t = (text ?? '').toLowerCase().replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || t.length > 60) return null
  let pulse: number | undefined
  const p = PULSE.exec(t)
  if (p) {
    pulse = Number(p[1] ?? p[2])
    t = (t.slice(0, p.index) + ' ' + t.slice(p.index + p[0].length)).replace(/\s+/g, ' ').replace(/\band\b|\bwith\b/g, ' ').replace(/\s+/g, ' ').trim()
  }
  t = t.replace(LEAD, '').trim()
  const pair = /^(\d{2,3})\s*(?:\/|\\|-|over|by|x|\s)\s*(\d{2,3})$/.exec(t)
  if (pair) return { sys: Number(pair[1]), dia: Number(pair[2]), ...(pulse != null ? { pulse } : {}) }
  if (/^\d{2,3}$/.test(t)) return { ask: 'over what?' }
  return null
}

const within = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max
/** May these numbers be saved from a notification reply? Out of bounds, or a top not above the bottom, opens the app instead. */
export function replyValid(r: { sys: number; dia: number; pulse?: number }): boolean {
  return within(r.sys, REPLY_TOP) && within(r.dia, REPLY_BOTTOM) && r.sys > r.dia && (r.pulse == null || within(r.pulse, REPLY_PULSE))
}
