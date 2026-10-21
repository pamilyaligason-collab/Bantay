// Pure parts of the dose-watch Edge Function, free of Deno APIs so Vitest can test them (fixed clock, no network).
// B-7: the push says only who and that a medicine was not marked. Never a medicine name, dose or value.
export const WATCH_AFTER_MIN = 120 // a slot is "missed" 2 hours after its time
export const WATCH_MAX_LATE_MIN = 6 * 60 // not before the function existed: never alert for a slot older than 6 h

export interface MedRow {
  id: string
  person_id: string
  name?: string | null // only for matching an old dose row that has no medication id; never logged or sent (B-7)
  med_status: string | null
  deleted_at: string | null
  as_needed: boolean | null
  schedule: unknown
  started_on?: string | null // YYYY-MM-DD
  stopped_on?: string | null
  people?: { archived_at: string | null } | null // embedded owner; an archived person is never watched
}
export interface TakenRow {
  person_id: string
  medication_id: string | null
  slot: string | null
  taken_at: string
  name?: string | null
}
export interface DueSlot {
  personId: string
  day: string // Asia/Manila YYYY-MM-DD of the slot
  slot: string // HH:MM
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const MANILA_OFFSET_MS = 8 * 3600_000 // Asia/Manila is UTC+8, no daylight saving

/** Asia/Manila calendar day of an instant (ms). */
export const manilaDay = (ms: number) => new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10)
/** The instant (ms) of a Manila day + HH:MM. */
const slotInstant = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00+08:00`)

/** Same rule as the app's normaliseDrug (health/meds.ts) and SQL normalise_drug: lower case, strength and form words removed. null when nothing is left. */
const NON_ALNUM = /[^a-z0-9]+/g
const FORM_WORDS = /(?<![\p{L}\p{N}_])(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syrup|susp|suspension|drop|drops|cream|ointment|oint|sachet|inhaler|neb|nebule|amp|ampule|vial)(?![\p{L}\p{N}_])/gu
export function normaliseDrug(x: string | null | undefined): string | null {
  const s = (x ?? '').toLowerCase()
    .replace(/[0-9]+([.,][0-9]+)?\s*(mg|mcg|ug|g|ml|iu|units?|%)(\s*\/\s*(ml|l|dose|tab))?(?![a-z])/g, ' ')
    .replace(FORM_WORDS, ' ')
    .replace(NON_ALNUM, ' ').replace(/\s+/g, ' ').trim()
  return s || null
}

/** Valid sorted unique HH:MM times from the v1 schedule object or the legacy array. Bad times are dropped, never guessed. */
export function scheduleTimes(raw: unknown): string[] {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(raw) ? raw : Array.isArray(o.times) ? o.times : []
  return [...new Set(list.filter((t): t is string => typeof t === 'string' && HHMM.test(t.trim())).map((t) => t.trim()))].sort()
}

/** The medicine has not been confirmed "Yes, still taking it": schedule.review is true. Carers are only alerted for confirmed medicines. */
export const inReview = (raw: unknown) => !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).review === true
const needsTime = (raw: unknown) => !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).needs_time === true

/** Slots that are at least 2 h past their time and have no taken or skipped row for that slot on that Manila day.
 *  A row with a slot closes that slot of its medicine. A row with no slot (an older dose, matched by medication id or by the normalised name)
 *  closes ONE open slot of that day, the earliest, like the app's matchDoses. One entry per person, day and slot; sorted.
 *  Skipped: medicines in review (not yet confirmed), needing a time, not started yet, already stopped, paused, deleted, as needed. */
export function dueSlots(meds: MedRow[], taken: TakenRow[], nowMs: number): DueSlot[] {
  const out = new Map<string, DueSlot>()
  const today = manilaDay(nowMs)
  const days = [...new Set([manilaDay(nowMs - WATCH_MAX_LATE_MIN * 60_000), today])] // also yesterday, for a slot just before midnight
  const rows = taken.flatMap((t) => { const at = Date.parse(t.taken_at); return Number.isNaN(at) ? [] : [{ ...t, day: manilaDay(at), key: normaliseDrug(t.name) }] })
  for (const m of meds) {
    if (m.people?.archived_at || m.deleted_at || (m.med_status ?? 'active') !== 'active' || m.as_needed) continue
    if (inReview(m.schedule) || needsTime(m.schedule)) continue
    const key = normaliseDrug(m.name)
    for (const day of days) {
      if ((m.started_on && m.started_on.slice(0, 10) > day) || (m.stopped_on && m.stopped_on.slice(0, 10) < day)) continue
      const mine = rows.filter((t) => t.person_id === m.person_id && t.day === day && (t.medication_id ? t.medication_id === m.id : !!key && t.key === key))
      const bySlot = new Set(mine.filter((t) => t.slot).map((t) => t.slot))
      let loose = mine.filter((t) => !t.slot).length // each unslotted dose covers one open slot, earliest first
      for (const slot of scheduleTimes(m.schedule)) { // sorted ascending
        if (bySlot.has(slot)) continue
        if (loose > 0) { loose--; continue }
        const late = nowMs - slotInstant(day, slot)
        if (late < WATCH_AFTER_MIN * 60_000 || late > WATCH_MAX_LATE_MIN * 60_000) continue
        // one open medicine keeps the person's slot open
        out.set(`${m.person_id}|${day}|${slot}`, { personId: m.person_id, day, slot })
      }
    }
  }
  return [...out.values()].sort((a, b) => (a.day + a.slot + a.personId).localeCompare(b.day + b.slot + b.personId))
}

const TITLES = new Set(['lola', 'lolo', 'tita', 'tito', 'ate', 'kuya', 'ma.', 'mama', 'papa', 'nanay', 'tatay', 'mrs', 'mrs.', 'mr', 'mr.', 'dr', 'dr.'])
/** Name for the push: the first word, or the first two when the first is a title (Lola Rosa, Dr. Cruz). Letters (incl. ñ), dot, hyphen, apostrophe,
 *  one space; at most 24 characters (by code point); "Someone" when nothing usable. */
export function firstName(displayName: string | null | undefined): string {
  const words = (displayName ?? '').trim().split(/\s+/).map((w) => w.replace(/[^\p{L}.'’-]/gu, '')).filter(Boolean)
  const take = words[0] && TITLES.has(words[0].toLowerCase()) && words.length > 1 ? words.slice(0, 2) : words.slice(0, 1)
  const clean = [...take.join(' ')].slice(0, 24).join('').trim()
  return /^\p{L}/u.test(clean) ? clean : 'Someone'
}

/** Web push body: exactly the keys the phone's buildNotification accepts for this alert. */
export const doseWatchPayload = (displayName: string | null | undefined) => ({ t: 'dose_watch' as const, n: firstName(displayName) })
/** The text the phone shows (kept here so the wording is tested next to the sender). */
export const doseWatchText = (name: string) => `${name} has not marked a medicine (2 h).`

export interface Carer {
  carer_id: string
  person_id: string
  can_write: boolean
}
/** User ids that get the alert for a person: writer carers, never the person themselves. */
export function recipients(personId: string, carers: Carer[], selfUserId: string | null | undefined): string[] {
  return [...new Set(carers.filter((c) => c.person_id === personId && c.can_write && c.carer_id !== selfUserId).map((c) => c.carer_id))].sort()
}

export interface Sub {
  user_id: string
  endpoint: string
  p256dh: string | null
  auth: string | null
}
export interface Port {
  medications(): Promise<MedRow[]>
  taken(sinceIso: string): Promise<TakenRow[]>
  person(id: string): Promise<{ display_name: string | null; auth_user_id: string | null } | null>
  carers(personId: string): Promise<Carer[]>
  subs(userIds: string[]): Promise<Sub[]>
  claim(personId: string, day: string, slot: string): Promise<boolean>
  /** Give the claim back (delete the row) so the next run can try again. */
  release(personId: string, day: string, slot: string): Promise<void>
  push(sub: Sub, payload: { t: 'dose_watch'; n: string }): Promise<number | null> // HTTP status, null on a network error
  removeSub(endpoint: string): Promise<void>
}

export interface Report { due: number; claimed: number; sent: number; removed: number; released: number }

/** One run. Claims each slot BEFORE sending, so a repeat run (or an overlapping one) sends nothing twice. */
export async function runDoseWatch(port: Port, nowMs: number): Promise<Report> {
  const r: Report = { due: 0, claimed: 0, sent: 0, removed: 0, released: 0 }
  const meds = await port.medications()
  if (!meds.length) return r
  const taken = await port.taken(new Date(nowMs - 2 * 86_400_000).toISOString())
  const slots = dueSlots(meds, taken, nowMs)
  r.due = slots.length
  for (const s of slots) {
    if (!(await port.claim(s.personId, s.day, s.slot))) continue
    r.claimed++
    const p = await port.person(s.personId)
    if (!p) continue
    const to = recipients(s.personId, await port.carers(s.personId), p.auth_user_id)
    if (!to.length) continue
    const payload = doseWatchPayload(p.display_name)
    const subs = await port.subs(to)
    let netErrors = 0
    for (const sub of subs) {
      const status = await port.push(sub, payload)
      if (status != null && status >= 200 && status < 300) r.sent++
      else if (status === 404 || status === 410) { await port.removeSub(sub.endpoint); r.removed++ }
      else if (status == null) netErrors++
    }
    // advisory push: claimed first, so a lost one is not sent again... unless EVERY send failed on the network, then the next run retries once
    if (subs.length > 0 && netErrors === subs.length) { await port.release(s.personId, s.day, s.slot); r.released++; r.claimed-- }
  }
  return r
}
