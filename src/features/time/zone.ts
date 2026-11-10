// S30 L8 (Texas): one place that says whose clock a day, a dose slot or a "quiet hour" is read on.
// The dose day and clock are the PERSON's zone (people.tz, default Asia/Manila), never a fixed +08:00 and never a DST table: the offset is asked
// from Intl at the instant, so Texas moves with its two clock changes and Manila never moves. Own data follows this phone's zone (set once at start);
// another person's data follows their zone when it is known (setPersonZones), else Asia/Manila (the column default).
export const DEFAULT_TZ = 'Asia/Manila'

/** A valid IANA zone name or null. Intl throws on a bad name, so this is also the whitelist for anything read from the server or the phone. */
export function validZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return null }
}

/** This phone's own zone (Intl), or null when the platform will not say. */
export function phoneZone(): string | null {
  try { return validZone(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch { return null }
}

let zone: string = DEFAULT_TZ
/** The zone own dose days are read on. Manila until the app starts and sets the phone's zone (tests stay on Manila unless they set one). */
export const getZone = (): string => zone
export const setZone = (tz: string | null | undefined): void => { zone = validZone(tz) ?? DEFAULT_TZ }
/** Called once at app start: own days follow this phone. */
export const initZone = (): void => setZone(phoneZone())

const parts = (tz: string, ms: number) => {
  const o: Record<string, number> = {}
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}
const pad = (n: number) => String(n).padStart(2, '0')

/** Offset of tz from UTC at an instant, in ms (Chicago winter -21600000, summer -18000000, Manila +28800000). */
export function offsetMs(tz: string, ms: number): number {
  const s = Math.floor(ms / 1000) * 1000
  const p = parts(tz, s)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - s
}

const toMs = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v))

/** Calendar day YYYY-MM-DD of an instant in tz ('' when the instant is not a date). */
export function dayIn(tz: string, v: Date | string | number): string {
  const ms = toMs(v)
  if (!Number.isFinite(ms)) return ''
  const p = parts(tz, ms)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}
/** Minutes after local midnight of an instant in tz (a dose slot's `at` is read on this clock). */
export function minutesIn(tz: string, v: Date | string | number): number {
  const p = parts(tz, toMs(v))
  return p.hour * 60 + p.minute
}
/** Hour 0-23 of an instant in tz. */
export const hourIn = (tz: string, v: Date | string | number): number => parts(tz, toMs(v)).hour

/** The instant (ms) of a local wall time (day YYYY-MM-DD, hh:mm) in tz. Asked twice so a time just after a clock change gets the right offset;
 *  a time that does not exist (spring forward) lands just after the gap, a repeated one on its first occurrence. */
export function wallToMs(tz: string, day: string, hhmm = '00:00'): number {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y!, m! - 1, d!, h!, mi!)
  let ms = wall - offsetMs(tz, wall)
  ms = wall - offsetMs(tz, ms)
  return ms
}

/** The dose day of an instant on the zone of the person; default this phone's zone. '' when it is not a date. */
export const tzDay = (v: Date | string | number = new Date(), tz: string = zone): string => dayIn(tz, v)
/** Local midnight that starts `day` in tz, as a Date. */
export const tzMidnight = (day: string, tz: string = zone): Date => new Date(wallToMs(tz, day))
/** Add n calendar days to a YYYY-MM-DD (pure calendar arithmetic, no zone). */
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// ---- other people's zones (A5/A8) ----
let personZones: Record<string, string> = {}
let selfId: string | null = null
export const setPersonZones = (m: Record<string, string | null | undefined>, self: string | null = selfId): void => {
  personZones = {}
  for (const [id, tz] of Object.entries(m)) { const z = validZone(tz); if (z) personZones[id] = z }
  selfId = self
}
/** The zone a person's own clock runs on: this phone's for me, their saved one, else Asia/Manila. */
export const zoneOf = (personId: string | null | undefined): string => (personId && personId === selfId ? zone : (personId && personZones[personId]) || DEFAULT_TZ)
/** True when a person's clock differs from the viewer's: their times then carry "(their time)" (A8). */
export const differsFromMine = (personId: string | null | undefined): boolean => !!personId && personId !== selfId && zoneOf(personId) !== zone
/** "8:00 AM (their time)" label helper. */
export const theirTime = (text: string, personId: string | null | undefined): string => (differsFromMine(personId) ? `${text} (their time)` : text)
