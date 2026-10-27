import { DOSE_WINDOW_MIN, dueDoses } from '../today/heroCards'
import { rankAlerts, type Alert } from '../safety/alerts'
import { dayOf, matchDoses, slotsFor } from '../health/meds'
import type { MedTaken, Medication } from '../log/store'
import type { AlertKind } from '../safety/alerts'
import type { AlertRow } from '../notify/store'
import { renderTemplate, TEMPLATES, type NotifyKind, type TemplateId } from '../notify/templates'

export type InboxKind = 'alert' | 'dose' | 'pin' | 'records' | 'update' | 'family'
/** `at` (ms) is when the thing happened, when the source says (an alert's issue time). Without it the thing is current, so it counts as Today.
 *  A `family` item is a carer_alerts row (D-78): `row` is it, `seen` comes from the row (not the kv list), `tone` is the template's. */
export interface InboxItem { id: string; kind: InboxKind; title: string; sub: string; href: string; at?: number; alertKind?: AlertKind; row?: AlertRow; seen?: boolean; tone?: 'urgent' | 'normal' }

const WEATHER_KINDS: AlertKind[] = ['tcws', 'rainfall', 'thunderstorm', 'heat', 'air']
/** The icon family of an item: dose, weather, family (PIN asks), record, or the generic alert and update. */
export type InboxIcon = 'dose' | 'weather' | 'family' | 'record' | 'alert' | 'update'
export const iconOf = (i: Pick<InboxItem, 'kind' | 'alertKind' | 'row'>): InboxIcon =>
  i.kind === 'family' ? familyIcon(i.row?.kind) :
  i.kind === 'dose' ? 'dose' : i.kind === 'pin' ? 'family' : i.kind === 'records' ? 'record' : i.kind === 'update' ? 'update'
    : i.alertKind && WEATHER_KINDS.includes(i.alertKind) ? 'weather' : 'alert'

const familyIcon = (k: NotifyKind | undefined): InboxIcon =>
  k === 'dose_missed' || k === 'review_open' ? 'dose' : k === 'hazard' ? 'weather' : k === 'sos' || k === 'sos_cancel' || k === 'reading_high' || k === 'mood_unwell' ? 'alert' : 'family'

const KIND_LABEL: Record<NotifyKind, string> = {
  dose_missed: 'Missed dose', review_open: 'Question', phone_health: 'Phone', reading_high: 'Reading', mood_unwell: 'Mood', hazard: 'Alert', sos: 'SOS', sos_cancel: 'SOS',
  digest: 'Summary', pin_approve: 'PIN', pin_changed: 'PIN', system: 'Admin', share: 'Sharing', rollcall: 'Storm check', kudos: 'Kudos'
}
const TITLE_WORDS = new Set(['lola', 'lolo', 'tita', 'tito', 'ate', 'kuya', 'ma.', 'mama', 'papa', 'nanay', 'tatay'])
/** A short name for "<name>" in a row: the first word, or the first two when it is a title (Ate Joy). null when there is nothing usable. */
export function shortName(full: string | null | undefined): string | null {
  const w = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (!w.length) return null
  return (w[0] && TITLE_WORDS.has(w[0].toLowerCase()) && w.length > 1 ? w.slice(0, 2) : w.slice(0, 1)).join(' ')
}
const manilaClock = (ms: number) => new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).format(ms)

/** One inbox row per unexpired carer_alerts row. Template ids carry no values, so the title is the fixed copy with the person's name filled in from this phone. */
export function familyItems(rows: AlertRow[], nameOf: (personId: string | null) => string | null, now: Date): InboxItem[] {
  const t = now.getTime()
  return rows.filter((r) => Date.parse(r.expiresAt) > t).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((r) => {
    const at = Date.parse(r.createdAt)
    const id = r.template as TemplateId
    const known = Object.hasOwn(TEMPLATES, id)
    const who = shortName(nameOf(r.personId))
    const text = renderTemplate(r.template, { name: who })
    const named = known && (TEMPLATES[id].title + TEMPLATES[id].body).includes('<name>')
    return {
      id: `ca:${r.id}`, kind: 'family' as const, title: text.title, sub: [KIND_LABEL[r.kind], !named && who ? who : null, manilaClock(at)].filter(Boolean).join(' · '),
      href: `#${known ? TEMPLATES[id].tab : 'today'}`, at, row: r, seen: r.seenAt != null, tone: text.tone
    }
  })
}

/** Today (this local calendar day, or no time given) and Earlier, each keeping the order they came in. */
export function groupInbox(items: InboxItem[], now: Date): { today: InboxItem[]; earlier: InboxItem[] } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const today: InboxItem[] = []
  const earlier: InboxItem[] = []
  for (const i of items) (i.at != null && i.at < start ? earlier : today).push(i)
  return { today, earlier }
}
export interface InboxSources {
  now: Date
  alerts: Alert[]
  /** @deprecated kv profile.medicines text "Losartan 8:00" (used only when `medications` is not given). Entries with no time are skipped, never guessed. */
  profile: unknown
  /** The live schedule: this person's medications rows. When given, doses come from it (taken/skipped by medicationId + slot) and `profile` and `skipped` are ignored. */
  medications?: Medication[]
  personId?: string
  taken: (Pick<MedTaken, 'name' | 'takenAt'> & Partial<Pick<MedTaken, 'medicationId' | 'slot' | 'skipped'>>)[]
  skipped: string[]
  updateVersion: string | null
  /** Admins only: open "Forgot PIN" requests and records waiting to be checked. Pass [] and 0 for everyone else. */
  pins: { id: number; handle: string }[]
  toCheck: number
  /** The family's carer_alerts rows (D-78) and a name lookup from this phone's people. Omitted: no family rows. */
  familyAlerts?: AlertRow[]
  nameOf?: (personId: string | null) => string | null
}

export const MAX_ALERTS = 5
const mins = (d: Date) => d.getHours() * 60 + d.getMinutes()
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

/** Today's doses that are due now or already past their window and not marked taken or skipped. */
export function pendingDoses(s: Pick<InboxSources, 'now' | 'profile' | 'taken' | 'skipped' | 'medications' | 'personId'>) {
  const nowMin = mins(s.now)
  if (s.medications && s.personId) {
    const day = dayOf(s.now)
    return matchDoses(slotsFor(s.medications, s.personId, day), s.taken, day)
      .filter((d) => d.state === 'pending' && d.at <= nowMin)
      .map((d) => ({ name: d.name, at: d.at, missed: nowMin >= d.at + DOSE_WINDOW_MIN }))
  }
  return dueDoses(s.profile, s.taken, s.skipped, s.now).map((d) => ({ ...d, missed: nowMin >= d.at + DOSE_WINDOW_MIN }))
}

/** Everything the inbox shows, in a fixed order: warnings, medicines, admin work, app update. Ids change when the thing changes, so "read" never hides something new. */
export function buildInbox(s: InboxSources): InboxItem[] {
  const out: InboxItem[] = familyItems(s.familyAlerts ?? [], s.nameOf ?? (() => null), s.now)
  for (const a of rankAlerts(s.alerts, null).slice(0, MAX_ALERTS)) {
    out.push({ id: `alert:${a.id}:${a.issuedAt}`, kind: 'alert', title: a.title, sub: `Alert · ${a.where || a.source}`, href: '#safety', alertKind: a.kind, ...(Number.isNaN(Date.parse(a.issuedAt)) ? {} : { at: Date.parse(a.issuedAt) }) })
  }
  const day = s.now.toDateString()
  for (const d of pendingDoses(s)) {
    out.push(d.missed
      ? { id: `dose:${day}:${d.name}:${d.at}:missed`, kind: 'dose', title: `${d.name} was not marked today`, sub: `Medicine · was due ${clock(d.at)}`, href: '#today' }
      : { id: `dose:${day}:${d.name}:${d.at}:due`, kind: 'dose', title: `Time for ${d.name}`, sub: `Medicine · ${clock(d.at)}`, href: '#today' })
  }
  for (const p of s.pins) out.push({ id: `pin:${p.id}`, kind: 'pin', title: `${p.handle} asked for a new PIN`, sub: 'PIN reset · open Admin', href: '#admin' })
  if (s.toCheck > 0) out.push({ id: `records:${s.toCheck}`, kind: 'records', title: `${s.toCheck} ${s.toCheck === 1 ? 'record' : 'records'} to check`, sub: 'Records · check the values before they count', href: '#records' })
  if (s.updateVersion) out.push({ id: `update:${s.updateVersion}`, kind: 'update', title: 'Bantay update ready', sub: `Update · version ${s.updateVersion}`, href: '#today' })
  return out
}

export const countUnread = (items: InboxItem[], seen: unknown) => {
  const set = new Set(Array.isArray(seen) ? seen : [])
  return items.filter((i) => (i.seen === undefined ? !set.has(i.id) : !i.seen)).length // a family row is seen when the server row says so
}
