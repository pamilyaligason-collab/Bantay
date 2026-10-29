// Pure parts of the dose-watch Edge Function, free of Deno APIs so Vitest can test them (fixed clock, no network).
// B-7: the push says only who and that a medicine was not marked. Never a medicine name, dose or value.
export const WATCH_AFTER_MIN = 30 // a slot is "missed" 30 minutes after its time (Q34); the cron passes DOSE_WATCH_AFTER_MIN over it
export const REVIEW_WATCH_AFTER_DAYS = 1 // a "Still taking it?" left open this many Manila days starts to be watched and raises review_open
export const DIGEST_HOUR = 20 // Manila hour of the calm family digest (Q15), sent in its first half hour
export const WATCH_MAX_LATE_MIN = 6 * 60 // not before the function existed: never alert for a slot older than 6 h

export interface MedRow {
  id: string
  person_id: string
  name?: string | null // only for matching an old dose row that has no medication id (and isVaccine); never logged or sent (B-7)
  generic_name?: string | null // optional: isVaccine also reads it when the cron selects it
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
export const TAKE_EARLY_MIN = 60 // a take may close a slot up to an hour before its time (07:30 closes 08:00)
/** The Manila day of the slot instance a take at `atMs` closes: the latest instance at or before take time + the early window, never a later day's slot (DS-7). */
export function slotDayOf(atMs: number, slot: string): string {
  const d0 = manilaDay(atMs)
  const days = [-1, 0, 1].map((k) => manilaDay(Date.parse(`${d0}T12:00:00+08:00`) + k * 86_400_000))
  return days.filter((d) => slotInstant(d, slot) <= atMs + TAKE_EARLY_MIN * 60_000).pop()!
}

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

/** A vaccine is a one-off shot, not a medicine to take on a clock: it never raises dose_missed, review_open or the digest. The prescription import turns a vaccine line
 *  (for example "PNEUMOCOCCAL POLYSACCHARIDE VACCINE 0.5 ML") into a medication row, so this reads the name. Whole words only: "vaccine"/"vaccination"/"bakuna" ("Vaccinium", the cranberry and bilberry plant, is not one), "toxoid",
 *  the pneumococcal and meningococcal families, and common brands. A normal medicine name never contains these words. */
const VACCINE_WORDS = /(?<![\p{L}\p{N}])(vaccines?|vaccinations?|bakuna|toxoids?|pneumococcal|meningococcal|pneumovax|prevnar|prevenar|shingrix|zostavax|gardasil|twinrix|havrix|engerix|vaxigrip|fluarix|influvac|boostrix|adacel|tdap|dtap|mmr)(?![\p{L}\p{N}])/iu
export const isVaccine = (m: Pick<MedRow, 'name' | 'generic_name'>) => VACCINE_WORDS.test(m.name ?? '') || VACCINE_WORDS.test(m.generic_name ?? '')

/** Valid sorted unique HH:MM times from the v1 schedule object or the legacy array. Bad times are dropped, never guessed. */
export function scheduleTimes(raw: unknown): string[] {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(raw) ? raw : Array.isArray(o.times) ? o.times : []
  return [...new Set(list.filter((t): t is string => typeof t === 'string' && HHMM.test(t.trim())).map((t) => t.trim()))].sort()
}

/** The medicine has not been confirmed "Yes, still taking it": schedule.review is true. */
export const inReview = (raw: unknown) => !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).review === true
/** Whole Manila days since the review was asked (schedule.review_since), 0 = asked today. null when not in review or the date is missing or not a date (unknown is never 0, ML-05). */
export function reviewAgeDays(raw: unknown, nowMs: number): number | null {
  if (!inReview(raw)) return null
  const since = (raw as Record<string, unknown>).review_since
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(since)) return null
  const a = Date.parse(`${since.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(a) ? null : Math.floor((Date.parse(`${manilaDay(nowMs)}T00:00:00Z`) - a) / 86_400_000)
}
/** Watched for missed doses: confirmed medicines, and a review medicine once its question is more than a day old. A review with no date is not watched. */
const watched = (raw: unknown, nowMs: number) => !inReview(raw) || (reviewAgeDays(raw, nowMs) ?? -1) >= REVIEW_WATCH_AFTER_DAYS
const needsTime = (raw: unknown) => !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).needs_time === true

interface OpenSlot { personId: string; day: string; slot: string; late: number }
/** Every watched slot of the given Manila days with no taken or skipped row, and how many ms past its time it is (negative = still to come).
 *  A row with a slot closes that slot of its medicine, matched by real time (the latest instance at or before take time + 60 min, so across midnight too). A row with no slot (an older dose, matched by medication id or by the normalised name)
 *  closes ONE open slot of that day, the earliest, like the app's matchDoses.
 *  Skipped: paused, stopped, deleted, as needed, needing a time, not started yet, already stopped, and a review medicine less than a day into its question. */
function openSlots(meds: MedRow[], taken: TakenRow[], nowMs: number, days: string[]): OpenSlot[] {
  const out: OpenSlot[] = []
  const rows = taken.flatMap((t) => { const at = Date.parse(t.taken_at); return Number.isNaN(at) ? [] : [{ ...t, day: manilaDay(at), key: normaliseDrug(t.name) }] })
  for (const m of meds) {
    if (m.people?.archived_at || m.deleted_at || (m.med_status ?? 'active') !== 'active' || m.as_needed || isVaccine(m)) continue
    if (needsTime(m.schedule) || !watched(m.schedule, nowMs)) continue
    const key = normaliseDrug(m.name)
    for (const day of days) {
      if ((m.started_on && m.started_on.slice(0, 10) > day) || (m.stopped_on && m.stopped_on.slice(0, 10) < day)) continue
      const mine = rows.filter((t) => t.person_id === m.person_id && (t.medication_id ? t.medication_id === m.id : !!key && t.key === key))
      const dayRows = mine.filter((t) => t.day === day)
      const used = new Set(mine.filter((t) => t.slot).map((t) => `${slotDayOf(Date.parse(t.taken_at), t.slot!)}|${t.slot}`)) // each take closes exactly one slot instance
      let loose = dayRows.filter((t) => !t.slot).length // each unslotted dose covers one open slot, earliest first
      for (const slot of scheduleTimes(m.schedule)) { // sorted ascending
        // a slotted row closes the latest instance at or before take time + 60 min (DS-7): 23:50 taken 00:05 closes that night's 23:50; 20:30 closes that day's 08:00, never the next day's
        if (used.has(`${day}|${slot}`)) continue
        if (loose > 0) { loose--; continue }
        out.push({ personId: m.person_id, day, slot, late: nowMs - slotInstant(day, slot) })
      }
    }
  }
  return out
}

/** Open slots at least `afterMin` past their time and not more than 6 h. One entry per person, day and slot (one open medicine keeps the person's slot open); sorted. */
export function dueSlots(meds: MedRow[], taken: TakenRow[], nowMs: number, afterMin: number = WATCH_AFTER_MIN): DueSlot[] {
  const days = [...new Set([manilaDay(nowMs - WATCH_MAX_LATE_MIN * 60_000), manilaDay(nowMs)])] // also yesterday, for a slot just before midnight
  const out = new Map<string, DueSlot>()
  for (const o of openSlots(meds, taken, nowMs, days)) {
    if (o.late < afterMin * 60_000 || o.late > WATCH_MAX_LATE_MIN * 60_000) continue
    out.set(`${o.personId}|${o.day}|${o.slot}`, { personId: o.personId, day: o.day, slot: o.slot })
  }
  return [...out.values()].sort((a, b) => (a.day + a.slot + a.personId).localeCompare(b.day + b.slot + b.personId))
}

/** Web push body for a carer's missed-dose alert (B-7, D-78): the carer-class template id and nothing else. `n` is a COUNT of missed doses when known, never a name. */
export const doseWatchPayload = (n?: number) => (n && n > 1 ? { t: 'dose_watch' as const, n } : { t: 'dose_watch' as const })

/** Q15: people with a dose today whose time has passed and is still open (an open compartment in the pillbox). Sorted. */
export function openToday(meds: MedRow[], taken: TakenRow[], nowMs: number): string[] {
  return [...new Set(openSlots(meds, taken, nowMs, [manilaDay(nowMs)]).filter((o) => o.late >= 0).map((o) => o.personId))].sort()
}

/** The first half hour of 20:00 Manila: the digest is made on each cron tick in it, and its ref (person + day) keeps it to one row. */
export const inDigestWindow = (nowMs: number) => { const d = new Date(nowMs + MANILA_OFFSET_MS); return d.getUTCHours() === DIGEST_HOUR && d.getUTCMinutes() < 30 }

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
  claim(personId: string, day: string, slot: string): Promise<boolean>
  /** Give the claim back (delete the row) so the next run can try again. */
  release(personId: string, day: string, slot: string): Promise<void>
  /** One carer_alerts row per carer (service role); a row with the same (kind, ref, carer) already there is ignored. Throws when the write fails. */
  carerRow(kind: string, personId: string, carerUserIds: string[], template: string, ref: string): Promise<void>
  /** Which of these users turned the 8 PM summary off (carer_prefs.digest_on = false, 0039). Applies to kind `digest` ONLY; every other alert ignores it.
   *  Optional so index.ts keeps type-checking until lane E wires it; with no port method nobody is filtered. Throws when the read fails (the digest then waits for the next run). */
  digestOff?(userIds: string[]): Promise<Set<string>>
  // Since D-78 the in-app row is the record and flushWebPush sends the browser push, so runDoseWatch no longer sends. These three stay on the type
  // only so index.ts's adapter (S1) keeps type-checking until it drops them.
  subs?(userIds: string[]): Promise<Sub[]>
  push?(sub: Sub, payload: { t: 'dose_watch'; n?: number }): Promise<number | null>
  /** True once the run is out of time: runDoseWatch stops and the unclaimed slots go to the next run. */
  overBudget?(): boolean
  removeSub?(endpoint: string): Promise<void>
}

export interface Report { due: number; claimed: number; rows: number; review: number; digest: number; failed: number }

/** One run (cron, every 15 minutes).
 *  Missed doses: claims each slot BEFORE writing, so a repeat or overlapping run writes nothing twice; then one `dose_missed` row per writer carer (ref person:day:slot).
 *  Review: a medicine whose "Still taking it?" is more than a day old gets a `review_open` row, once per medicine per Manila day.
 *  Digest: in the first half hour of 20:00 Manila, a `digest` row for each person who still has an open dose today, once per day (Q15).
 *  A write that fails gives its claim back and is counted in `failed`; the run does the rest, then returns the report (never throws), so the caller reports failed > 0 on the heartbeat and the next run tries again. */
export async function runDoseWatch(port: Port, nowMs: number, opts: { afterMin?: number } = {}): Promise<Report> {
  const r: Report = { due: 0, claimed: 0, rows: 0, review: 0, digest: 0, failed: 0 }
  const meds = await port.medications()
  if (!meds.length) return r
  const today = manilaDay(nowMs)
  const who = new Map<string, string[]>() // person -> the writer carers who get the row (empty = nobody to tell)
  const to = async (personId: string) => {
    if (!who.has(personId)) { const p = await port.person(personId); who.set(personId, p ? recipients(personId, await port.carers(personId), p.auth_user_id) : []) }
    return who.get(personId)!
  }
  const taken = await port.taken(new Date(nowMs - 2 * 86_400_000).toISOString())
  const slots = dueSlots(meds, taken, nowMs, opts.afterMin)
  r.due = slots.length
  for (const s of slots) {
    if (port.overBudget?.()) break // out of time: the unclaimed slots are picked up by the next run
    if (!(await port.claim(s.personId, s.day, s.slot))) continue
    r.claimed++
    try {
      const carers = await to(s.personId)
      if (!carers.length) continue
      await port.carerRow('dose_missed', s.personId, carers, 'dose_missed', `${s.personId}:${s.day}:${s.slot}`)
      r.rows++
    } catch { await port.release(s.personId, s.day, s.slot); r.claimed--; r.failed++ }
  }
  const row = async (kind: 'review_open' | 'digest', personId: string, ref: string) => {
    try {
      let carers = await to(personId)
      if (kind === 'digest' && carers.length && port.digestOff) { const off = await port.digestOff(carers); carers = carers.filter((c) => !off.has(c)) } // only the summary honours the opt-out
      if (!carers.length) return false
      await port.carerRow(kind, personId, carers, kind, ref)
      return true
    } catch { r.failed++; return false }
  }
  for (const m of meds) {
    if (m.people?.archived_at || isVaccine(m) || (reviewAgeDays(m.schedule, nowMs) ?? -1) < REVIEW_WATCH_AFTER_DAYS) continue
    if (await row('review_open', m.person_id, `${m.id}:${today}`)) r.review++
  }
  if (inDigestWindow(nowMs)) for (const personId of openToday(meds, taken, nowMs)) if (await row('digest', personId, `${personId}:${today}`)) r.digest++
  return r // failed > 0 does not throw: index.ts keeps running flushWebPush, sweepPhoneHealth, doseDue and prune, and turns the heartbeat red from report.failed
}
