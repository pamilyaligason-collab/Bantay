import { DOSE_WINDOW_MIN, dueDoses } from '../today/heroCards'
import { rankAlerts, type Alert } from '../safety/alerts'

export type InboxKind = 'alert' | 'dose' | 'pin' | 'records' | 'update'
export interface InboxItem { id: string; kind: InboxKind; title: string; sub: string; href: string }
export interface InboxSources {
  now: Date
  alerts: Alert[]
  /** kv profile.medicines: "Losartan 8:00". Entries with no time are skipped, never guessed. */
  profile: unknown
  taken: { name: string; takenAt: string }[]
  skipped: string[]
  updateVersion: string | null
  /** Admins only: open "Forgot PIN" requests and records waiting to be checked. Pass [] and 0 for everyone else. */
  pins: { id: number; handle: string }[]
  toCheck: number
}

export const MAX_ALERTS = 5
const mins = (d: Date) => d.getHours() * 60 + d.getMinutes()
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

/** Today's doses that are due now or already past their window and not marked taken or skipped. */
export function pendingDoses(s: Pick<InboxSources, 'now' | 'profile' | 'taken' | 'skipped'>) {
  const nowMin = mins(s.now)
  return dueDoses(s.profile, s.taken, s.skipped, s.now).map((d) => ({ ...d, missed: nowMin >= d.at + DOSE_WINDOW_MIN }))
}

/** Everything the inbox shows, in a fixed order: warnings, medicines, admin work, app update. Ids change when the thing changes, so "read" never hides something new. */
export function buildInbox(s: InboxSources): InboxItem[] {
  const out: InboxItem[] = []
  for (const a of rankAlerts(s.alerts, null).slice(0, MAX_ALERTS)) {
    out.push({ id: `alert:${a.id}:${a.issuedAt}`, kind: 'alert', title: a.title, sub: `Alert · ${a.where || a.source}`, href: '#safety' })
  }
  const day = s.now.toDateString()
  for (const d of pendingDoses(s)) {
    out.push(d.missed
      ? { id: `dose:${day}:${d.name}:missed`, kind: 'dose', title: `${d.name} was not marked today`, sub: `Medicine · was due ${clock(d.at)}`, href: '#today' }
      : { id: `dose:${day}:${d.name}:due`, kind: 'dose', title: `Time for ${d.name}`, sub: `Medicine · ${clock(d.at)}`, href: '#today' })
  }
  for (const p of s.pins) out.push({ id: `pin:${p.id}`, kind: 'pin', title: `${p.handle} asked for a new PIN`, sub: 'PIN reset · open Admin', href: '#admin' })
  if (s.toCheck > 0) out.push({ id: `records:${s.toCheck}`, kind: 'records', title: `${s.toCheck} ${s.toCheck === 1 ? 'record' : 'records'} to check`, sub: 'Records · check the values before they count', href: '#records' })
  if (s.updateVersion) out.push({ id: `update:${s.updateVersion}`, kind: 'update', title: 'Bantay update ready', sub: `Update · version ${s.updateVersion}`, href: '#today' })
  return out
}

export const countUnread = (items: InboxItem[], seen: unknown) => {
  const set = new Set(Array.isArray(seen) ? seen : [])
  return items.filter((i) => !set.has(i.id)).length
}
