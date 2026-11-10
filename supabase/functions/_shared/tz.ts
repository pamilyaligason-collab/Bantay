// S30 L8 (Texas): the server's twin of src/features/time/zone.ts (a vitest keeps them equal). A person's dose day, slot instant and quiet hours are read on THEIR zone
// (people.tz, default Asia/Manila). The offset is asked from Intl at the instant, so there is no DST table and Texas moves with its two clock changes. Pure: no Deno API.
export const DEFAULT_TZ = 'Asia/Manila'

/** A valid IANA zone name or the default. Anything read from the database passes through here before it reaches Intl (which throws on a bad name). */
export function safeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return DEFAULT_TZ
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return DEFAULT_TZ }
}

const fmts = new Map<string, Intl.DateTimeFormat>() // building a formatter is the slow part; one per zone
const fmt = (tz: string) => { let f = fmts.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); fmts.set(tz, f) } return f }
const parts = (tz: string, ms: number) => {
  const o: Record<string, number> = {}
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}
const pad = (n: number) => String(n).padStart(2, '0')

/** Offset of tz from UTC at an instant, in ms. */
export function offsetMs(tz: string, ms: number): number {
  const s = Math.floor(ms / 1000) * 1000
  const p = parts(tz, s)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - s
}

/** Calendar day YYYY-MM-DD of an instant (ms) in tz. */
export function dayIn(tz: string, ms: number): string {
  const p = parts(tz, ms)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}
/** Hour 0-23 of an instant (ms) in tz. */
export const hourIn = (tz: string, ms: number): number => parts(tz, ms).hour

/** The instant (ms) of a local wall time (day YYYY-MM-DD, HH:MM) in tz, right on both sides of a clock change. */
export function slotInstant(tz: string, day: string, hhmm: string): number {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y!, m! - 1, d!, h!, mi!)
  let ms = wall - offsetMs(tz, wall)
  ms = wall - offsetMs(tz, ms)
  return ms
}
