// Pure parts of the dose-watch Edge Function, free of Deno APIs so Vitest can test them (fixed clock, no network).
// B-7: the push says only who and that a medicine was not marked. Never a medicine name, dose or value.
export const WATCH_AFTER_MIN = 120 // a slot is "missed" 2 hours after its time
export const WATCH_MAX_LATE_MIN = 6 * 60 // not before the function existed: never alert for a slot older than 6 h
export const REVIEW_GRACE_DAYS = 3 // D5, same as the app: an unanswered "Still taking it?" stops the watch

export interface MedRow {
  id: string
  person_id: string
  med_status: string | null
  deleted_at: string | null
  as_needed: boolean | null
  schedule: unknown
}
export interface TakenRow {
  person_id: string
  medication_id: string | null
  slot: string | null
  taken_at: string
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

/** Valid sorted unique HH:MM times from the v1 schedule object or the legacy array. Bad times are dropped, never guessed. */
export function scheduleTimes(raw: unknown): string[] {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(raw) ? raw : Array.isArray(o.times) ? o.times : []
  return [...new Set(list.filter((t): t is string => typeof t === 'string' && HHMM.test(t.trim())).map((t) => t.trim()))].sort()
}

/** D5: the "Still taking it?" review is more than 3 days old (pauses ON review_since + 3 days). */
export function reviewOverdue(raw: unknown, day: string): boolean {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  if (o.review !== true || typeof o.review_since !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(o.review_since)) return false
  const t = new Date(`${o.review_since.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) return false
  t.setUTCDate(t.getUTCDate() + REVIEW_GRACE_DAYS)
  return t.toISOString().slice(0, 10) <= day
}

/** Slots that are at least 2 h past their time and have no taken or skipped row for that slot on that Manila day.
 *  One entry per person, day and slot (two medicines in one slot make one alert). Sorted. */
export function dueSlots(meds: MedRow[], taken: TakenRow[], nowMs: number): DueSlot[] {
  const out = new Map<string, DueSlot>()
  const today = manilaDay(nowMs)
  const days = [...new Set([manilaDay(nowMs - WATCH_MAX_LATE_MIN * 60_000), today])] // also yesterday, for a slot just before midnight
  const done = new Set<string>() // personId|medicationId|day|slot, a row of either kind (taken or skipped)
  for (const t of taken) {
    const at = Date.parse(t.taken_at)
    if (!t.medication_id || !t.slot || Number.isNaN(at)) continue
    done.add(`${t.person_id}|${t.medication_id}|${manilaDay(at)}|${t.slot}`)
  }
  for (const m of meds) {
    if (m.deleted_at || (m.med_status ?? 'active') !== 'active' || m.as_needed) continue
    for (const day of days) {
      if (reviewOverdue(m.schedule, day)) continue
      for (const slot of scheduleTimes(m.schedule)) {
        const late = nowMs - slotInstant(day, slot)
        if (late < WATCH_AFTER_MIN * 60_000 || late > WATCH_MAX_LATE_MIN * 60_000) continue
        // the slot is covered only when EVERY medicine of the person in that slot has a row; one open medicine keeps it open
        if (done.has(`${m.person_id}|${m.id}|${day}|${slot}`)) continue
        out.set(`${m.person_id}|${day}|${slot}`, { personId: m.person_id, day, slot })
      }
    }
  }
  return [...out.values()].sort((a, b) => (a.day + a.slot + a.personId).localeCompare(b.day + b.slot + b.personId))
}

/** First name for the push: letters, spaces, dot, hyphen, apostrophe only, at most 24 characters; "Someone" when nothing usable. */
export function firstName(displayName: string | null | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? ''
  const clean = first.replace(/[^\p{L}.'’-]/gu, '').slice(0, 24)
  return clean || 'Someone'
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
  push(sub: Sub, payload: { t: 'dose_watch'; n: string }): Promise<number | null> // HTTP status, null on a network error
  removeSub(endpoint: string): Promise<void>
}

export interface Report { due: number; claimed: number; sent: number; removed: number }

/** One run. Claims each slot BEFORE sending, so a repeat run (or an overlapping one) sends nothing twice. */
export async function runDoseWatch(port: Port, nowMs: number): Promise<Report> {
  const r: Report = { due: 0, claimed: 0, sent: 0, removed: 0 }
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
    for (const sub of await port.subs(to)) {
      const status = await port.push(sub, payload)
      if (status != null && status >= 200 && status < 300) r.sent++
      else if (status === 404 || status === 410) { await port.removeSub(sub.endpoint); r.removed++ }
    }
  }
  return r
}
