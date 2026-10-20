import type { MedTaken, Medication } from '../log/store'

/** Pure helpers for the live medicine schedule (public.medications, PART-3 1.2 and 1.3). No React, no storage. */

export const REVIEW_GRACE_DAYS = 3 // D5: an unanswered "Still taking it?" pauses the reminder this many days after review_since

export interface ParsedSchedule {
  /** Valid 'HH:MM' clock strings, sorted, no duplicates. */
  times: string[]
  needsTime: boolean
  needsCheck: boolean
  review: boolean
  /** YYYY-MM-DD or null. */
  reviewSince: string | null
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY = /^\d{4}-\d{2}-\d{2}/

/** Schedule jsonb -> a safe shape. Accepts v1 {"v":1,"times":[...]} and the legacy array form ['08:00']. Bad times are dropped, never guessed. */
export function parseSchedule(raw: unknown): ParsedSchedule {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(raw) ? raw : Array.isArray(o.times) ? o.times : []
  const times = [...new Set(list.filter((t): t is string => typeof t === 'string' && HHMM.test(t.trim())).map((t) => t.trim()))].sort()
  const since = typeof o.review_since === 'string' && DAY.test(o.review_since) ? o.review_since.slice(0, 10) : null
  return { times, needsTime: o.needs_time === true, needsCheck: o.needs_check === true, review: o.review === true, reviewSince: since }
}

/** 'HH:MM' -> minutes after local midnight. */
export const toMinutes = (hhmm: string) => { const m = HHMM.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
export const toClock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Local calendar day (YYYY-MM-DD) of an ISO instant or a Date. */
export const dayOf = (v: string | Date) => { const d = typeof v === 'string' ? new Date(v) : v; return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Same rule as the SQL normalise_drug (0014): lower case, strength (500mg, 5 mg, 10 mg/ml) and form words (tab, cap, syrup ...) removed. null when nothing is left. */
/** Same as SQL under a UTF-8 locale: \m and \M (word edges) treat any letter or digit as a word character, so "ñtab" has no edge before "tab" and
 *  the form word is NOT stripped; afterwards [^a-z0-9] turns every non-ASCII letter into a separator, giving "tab". Under the C locale PG would
 *  differ (ñ is not a word char there); JS lower() vs PG lower() can also differ for a few special letters (e.g. 'İ'). Those are the only differences. */
const NON_ALNUM = /[^a-z0-9]+/g
const FORM_WORDS = /(?<![\p{L}\p{N}_])(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syrup|susp|suspension|drop|drops|cream|ointment|oint|sachet|inhaler|neb|nebule|amp|ampule|vial)(?![\p{L}\p{N}_])/gu
export function normaliseDrug(x: string | null | undefined): string | null {
  const s = (x ?? '').toLowerCase()
    .replace(/[0-9]+([.,][0-9]+)?\s*(mg|mcg|ug|g|ml|iu|units?|%)(\s*\/\s*(ml|l|dose|tab))?(?![a-z])/g, ' ')
    .replace(FORM_WORDS, ' ')
    .replace(NON_ALNUM, ' ').replace(/\s+/g, ' ').trim()
  return s || null
}

const isDeleted = (m: Medication) => !!(m as { deletedAt?: unknown }).deletedAt
/** Not deleted, and active (a row with no medStatus is active). */
export const isLive = (m: Medication) => !isDeleted(m) && (m.medStatus ?? 'active') === 'active'

const MANILA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Calendar day (YYYY-MM-DD) in Asia/Manila of an instant. */
const manilaDay = (d: Date) => (Number.isNaN(d.getTime()) ? '' : MANILA.format(d))

/** D5: the review has been open longer than 3 days. `today` is YYYY-MM-DD or a Date. */
export function reviewOverdue(med: Pick<Medication, 'schedule'>, today: string | Date): boolean {
  const s = parseSchedule(med.schedule)
  if (!s.review || !s.reviewSince) return false
  const t = new Date(`${s.reviewSince}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) return false
  t.setUTCDate(t.getUTCDate() + REVIEW_GRACE_DAYS)
  const due = t.toISOString().slice(0, 10) // review_since is a calendar date: plain date arithmetic, no time zone shift
  const day = typeof today === 'string' ? today.slice(0, 10) : manilaDay(today)
  return !!day && due <= day // pauses ON review_since + 3 days
}

export interface MedSlot {
  medicationId: string | null // the server id; null for a row that has none yet
  key: string // stable local key: serverId, else clientId, else local id
  personId: string
  name: string
  dose: string | null
  slot: string // 'HH:MM'
  at: number // minutes after local midnight
}

const keyOf = (m: Medication) => m.serverId ?? m.clientId ?? String(m.id ?? m.name)

/** Doses due on `day` for one person from active medications. Paused, stopped, deleted, as-needed and needs-time rows give none. Sorted by time. */
export function slotsFor(meds: Medication[], personId: string, day: string): MedSlot[] {
  const out: MedSlot[] = []
  for (const m of meds) {
    if (m.personId !== personId || !isLive(m) || m.asNeeded) continue
    if ((m.startedOn && m.startedOn > day) || (m.stoppedOn && m.stoppedOn < day)) continue
    const s = parseSchedule(m.schedule)
    if (s.needsTime) continue
    for (const t of s.times) out.push({ medicationId: m.serverId ?? null, key: keyOf(m), personId, name: m.name, dose: m.dose ?? null, slot: t, at: toMinutes(t)! })
  }
  return out.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))
}

export type DoseState = MedSlot & { state: 'taken' | 'skipped' | 'pending' }
const lc = (s: string) => normaliseDrug(s) ?? s.trim().toLowerCase()

/** Marks each slot taken, skipped or pending from the takes logged on `day`. Matches by medicationId + slot; a take with no medicationId
 *  (an old row) falls back to a name match on the normalised drug name ("Losartan" matches "Losartan 50mg tab") and uses up the earliest slots of that name, one per take. */
export function matchDoses(slots: MedSlot[], takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>[], day: string): DoseState[] {
  const today = takes.filter((t) => dayOf(t.takenAt) === day)
  const byId = today.filter((t) => t.medicationId)
  const legacy = today.filter((t) => !t.medicationId && !t.skipped)
  const used = new Map<string, number>()
  return [...slots].sort((a, b) => a.at - b.at).map((s) => {
    const mine = s.medicationId ? byId.filter((t) => t.medicationId === s.medicationId && t.slot === s.slot) : []
    if (mine.some((t) => !t.skipped)) return { ...s, state: 'taken' as const }
    if (mine.length) return { ...s, state: 'skipped' as const }
    const n = legacy.filter((t) => lc(t.name) === lc(s.name)).length
    const seen = used.get(lc(s.name)) ?? 0
    used.set(lc(s.name), seen + 1)
    return { ...s, state: seen < n ? ('taken' as const) : ('pending' as const) }
  })
}

/** Active medications of a person: for lists that show names. */
export const liveMedicines = (meds: Medication[], personId: string) => meds.filter((m) => m.personId === personId && isLive(m))

/** The local medication a spoken or typed name means: normalised name (or generic name) match, live rows first. Several matches: undefined, nobody is guessed. */
export function resolveMedication(meds: Medication[], personId: string, spoken: string): Medication | undefined {
  const q = normaliseDrug(spoken)
  if (!q) return undefined
  const mine = meds.filter((m) => m.personId === personId && !isDeleted(m) && (normaliseDrug(m.name) === q || normaliseDrug(m.genericName) === q))
  const live = mine.filter(isLive)
  const pick = live.length ? live : mine
  return pick.length === 1 ? pick[0] : undefined
}

/** Active, timed medications that should remind: those whose review is not overdue (D5). */
export const remindable = (meds: Medication[], personId: string, today: string | Date) =>
  meds.filter((m) => {
    if (m.personId !== personId || !isLive(m) || m.asNeeded || reviewOverdue(m, today)) return false
    const day = typeof today === 'string' ? today.slice(0, 10) : dayOf(today)
    return !((m.startedOn && m.startedOn > day) || (m.stoppedOn && m.stoppedOn < day)) // same window as slotsFor
  })

/** Deterministic, collision-safe notification id from a medication key + slot: 31-bit positive hash, above the old 31000 range. */
export function reminderId(key: string, slot: string): number {
  let h = 2166136261
  for (const c of `${key}|${slot}`) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0 }
  return 100_000 + (h % 2_000_000_000)
}

/** Which slot a dose logged at `when` belongs to: the open (not yet taken or skipped) slot of that day latest at or before that time (else the earliest). undefined for an as-needed medicine,
 *  one with no times, or when every slot of the day is done (an extra dose has no slot). */
export function pickSlot(med: Medication, takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>[], when: Date): string | undefined {
  const day = dayOf(when)
  const open = matchDoses(slotsFor([med], med.personId, day), takes, day).filter((d) => d.state === 'pending')
  const at = when.getHours() * 60 + when.getMinutes()
  const sorted = open.sort((a, b) => a.at - b.at)
  // the latest open slot at or before the time of the take; never a slot still in the future. None yet: the earliest.
  return ([...sorted].reverse().find((d) => d.at <= at) ?? sorted[0])?.slot
}
