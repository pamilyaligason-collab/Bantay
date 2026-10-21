import { supabase } from '../../auth/client'
import { adminMembers, listPinRequests, rpc, type PinRequest, type UsageRow } from '../api'
import { loadDuplicates } from './recordsApi'
import { memberState, type Row as MemberRow } from './Members'
import { deskHref } from './types'
import type { Tone } from './ui'

// Dashboard home: counts only, never a health value. Each loader is one card's data, so a card can fail on its own.
export type Res<T> = { ok: true; data: T } | { ok: false; error: string }
const NO = { ok: false, error: 'not_connected' } as const
const bad = { ok: false, error: 'failed' } as const

// ---------- Asia/Manila days (UTC+8, no daylight saving) ----------
const DAY = 86_400_000
export const manilaDay = (t: number | string | Date) => new Date(new Date(t).getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
/** The last `n` Manila days, oldest first, ending today. */
export const lastDays = (n: number, now: Date = new Date()) => { const t = manilaDay(now); return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1)) }
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
/** Monday of each of the last `n` weeks, oldest first. */
export const lastWeeks = (n: number, now: Date = new Date()) => { const m = mondayOf(manilaDay(now)); return Array.from({ length: n }, (_, i) => addDays(m, 7 * (i - n + 1))) }
export const dayStartIso = (day: string) => `${day}T00:00:00+08:00`

/** Counts per day; times that do not parse, or fall outside `days`, are skipped. */
export function bucketByDay(ats: (string | null | undefined)[], days: string[]): number[] {
  const at = new Map(days.map((d, i) => [d, i]))
  const out = days.map(() => 0)
  for (const a of ats) {
    const t = a ? Date.parse(a) : NaN
    if (Number.isNaN(t)) continue
    const i = at.get(manilaDay(t))
    if (i !== undefined) out[i]++
  }
  return out
}

// ---------- Rules ----------
/** A tile is coloured only when something needs action. Unknown (null) stays plain. */
export const toneIf = (n: number | null | undefined, tone: Tone): Tone => (n != null && Number.isFinite(n) && n > 0 ? tone : 'plain')

/** IDs / policies ending between today and today + `window` days (inclusive). Blank or malformed dates never count. */
export function expiringCount(dates: (string | null | undefined)[], today: string, window = 60) {
  const last = addDays(today, window)
  return dates.filter((d) => { const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null; return x !== null && x >= today && x <= last }).length
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** Text for a screen reader: 'Average 23 per day, highest Tuesday'. `weekly` words the unit and the peak as a week. */
export function summarize(values: number[], labels: string[], weekly = false) {
  const total = values.reduce((a, b) => a + b, 0)
  if (!values.length || total === 0) return weekly ? 'Nothing confirmed in these weeks.' : 'No screens opened in this period.'
  const hi = values.indexOf(Math.max(...values))
  const avg = Math.round(total / values.length)
  return `Average ${avg} per ${weekly ? 'week' : 'day'}, highest ${weekly ? `week of ${dayShort(labels[hi])}` : DAYS[new Date(`${labels[hi]}T00:00:00Z`).getUTCDay()]}`
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return 'Never'
  const m = Math.floor((now - t) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.floor(m / 60)} h ago`
  if (m < 43_200) return `${Math.floor(m / 1440)} d ago`
  return new Date(t).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
}

// ---------- Confirm queue ----------
export type QueueRow = { person_id: string; kind: string; drafts: number }
export const KIND_WORDS: Record<string, string> = { lab_results: 'labs', prescription_items: 'prescription lines', documents: 'papers', imaging_reports: 'imaging', vaccinations: 'vaccinations' }
export const kindWord = (k: string) => KIND_WORDS[k] ?? k.replace(/_/g, ' ')
const counted = (r: QueueRow) => Number.isFinite(Number(r.drafts)) && Number(r.drafts) > 0

export function queueSummary(rows: QueueRow[]) {
  const per = new Map<string, Map<string, number>>()
  const kinds = new Map<string, number>()
  for (const r of rows.filter(counted)) {
    const n = Number(r.drafts)
    const m = per.get(r.person_id) ?? new Map<string, number>()
    m.set(r.kind, (m.get(r.kind) ?? 0) + n)
    per.set(r.person_id, m)
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + n)
  }
  const byPerson = [...per].map(([person_id, m]) => ({ person_id, total: [...m.values()].reduce((a, b) => a + b, 0), kinds: [...m].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n) }))
    .sort((a, b) => b.total - a.total)
  const top = [...kinds].sort((a, b) => b[1] - a[1])[0]
  return { total: byPerson.reduce((a, p) => a + p.total, 0), byPerson, biggest: top ? { kind: top[0], n: top[1] } : null }
}

// ---------- Needs you ----------
export type Need = { key: string; text: string; href: string; action: string }
export function needsYou(i: { pins: PinRequest[]; personOf: (userId: string) => string | null; dupes: number | null; failed: number | null; locked: { name: string; personId: string | null }[] }): Need[] {
  const out: Need[] = i.pins.map((p) => { const pid = i.personOf(p.user_id); return { key: `pin${p.id}`, text: `PIN reset asked by ${p.handle}`, href: pid ? deskHref('members', pid, 'account') : deskHref('members'), action: 'Reset PIN' } })
  if (i.dupes) out.push({ key: 'dupes', text: `${i.dupes} duplicate ${i.dupes === 1 ? 'pair' : 'pairs'} to review`, href: deskHref('duplicates'), action: 'Review' })
  if (i.failed) out.push({ key: 'failed', text: `${i.failed} ${i.failed === 1 ? 'scan' : 'scans'} failed`, href: deskHref('files'), action: 'Open' })
  for (const l of i.locked) out.push({ key: `lock${l.personId ?? l.name}`, text: `${l.name} is locked out`, href: l.personId ? deskHref('members', l.personId, 'account') : deskHref('members'), action: 'Unlock' })
  return out
}

// ---------- Recent changes ----------
export type AuditLite = { id: number; at: string; actor: string | null; tbl: string; person_id: string | null; action: string; fields: string[] | null }
export const ACTION_WORDS: Record<string, string> = { insert: 'Add', update: 'Update', confirm: 'Confirm', reject: 'Reject', delete: 'Delete', reveal: 'Reveal' }
export const actionTone = (a: string): Tone => (a === 'confirm' ? 'ok' : a === 'reject' || a === 'delete' || a === 'reveal' ? 'bad' : 'plain')
export const fieldsText = (f: string[] | null | undefined) => { const x = (f ?? []).filter(Boolean); return x.length ? x.slice(0, 3).join(', ') + (x.length > 3 ? ` +${x.length - 3}` : '') : '' }

// ---------- Loaders ----------
async function guard<T>(f: () => PromiseLike<Res<T>>): Promise<Res<T>> { if (!supabase) return NO; try { return await f() } catch { return bad } }
const head = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<Res<number>> => { const r = await q; return r.error || r.count == null ? bad : { ok: true, data: r.count } }

export type PeopleState = { total: number; active: number | null; locked: { name: string; personId: string | null }[]; personOf: Record<string, string> }
/** Members who can sign in (not disabled), how many used the app in 7 days, who is locked out. Usage failing leaves `active` null. */
export const loadPeopleState = (): Promise<Res<PeopleState>> => guard(async () => {
  const [m, u] = await Promise.all([adminMembers<{ members: MemberRow[] }>({ action: 'list' }), rpc<UsageRow[]>('admin_usage_summary', { days: 30 })])
  if (!m.ok) return m
  const live = m.data.members.filter((x) => !x.disabled)
  const seen = u.ok ? new Set(u.data.filter((x) => x.active_7).map((x) => x.user_id)) : null
  return { ok: true, data: {
    total: live.length,
    active: seen ? live.filter((x) => seen.has(x.userId)).length : null,
    locked: live.filter((x) => memberState(x).locked).map((x) => ({ name: x.displayName, personId: x.personId })),
    personOf: Object.fromEntries(m.data.members.filter((x) => x.personId).map((x) => [x.userId, x.personId as string]))
  } }
})

export const loadQueue = () => guard<QueueRow[]>(async () => {
  const { data, error } = await supabase!.from('records_queue').select('person_id, kind, drafts')
  return error ? bad : { ok: true, data: (data ?? []) as QueueRow[] }
})

export const loadFailedScans = () => guard(() => head(supabase!.from('source_files').select('id', { count: 'exact', head: true }).eq('ingest_status', 'failed')))

/** person_identifiers: id, person_id, id_type, expires_on only (never the number). insurance_policies: id, person_id, valid_to only. */
export const loadExpiring = (now: Date = new Date()) => guard<number>(async () => {
  const today = manilaDay(now), last = addDays(today, 60)
  const [a, b] = await Promise.all([
    supabase!.from('person_identifiers').select('id, person_id, id_type, expires_on').gte('expires_on', today).lte('expires_on', last),
    supabase!.from('insurance_policies').select('id, person_id, valid_to').gte('valid_to', today).lte('valid_to', last)
  ])
  if (a.error || b.error) return bad
  return { ok: true, data: expiringCount([...(a.data ?? []).map((r) => r.expires_on as string | null), ...(b.data ?? []).map((r) => r.valid_to as string | null)], today) }
})

export const loadDupeCount = () => guard<number>(async () => { const r = await loadDuplicates(); return r.ok ? { ok: true, data: r.data.groups.length } : bad })
export const loadPins = () => guard<PinRequest[]>(async () => { const r = await listPinRequests(); return r.ok ? r : bad })

/** Screens opened per day for `days` Manila days: one paged select of `at` (kind 'screen'), bucketed here. Capped at 20,000 rows. */
export const loadUsageSeries = (days = 30, now: Date = new Date()) => guard<{ days: string[]; values: number[] }>(async () => {
  const ds = lastDays(days, now), since = dayStartIso(ds[0]), ats: string[] = []
  for (let p = 0; p < 20; p++) {
    const { data, error } = await supabase!.from('usage_events').select('at').eq('kind', 'screen').gte('at', since).order('at').range(p * 1000, p * 1000 + 999)
    if (error) return bad
    ats.push(...(data ?? []).map((r) => r.at as string))
    if ((data?.length ?? 0) < 1000) break
  }
  return { ok: true, data: { days: ds, values: bucketByDay(ats, ds) } }
})

/** Labs and papers confirmed in each of the last `weeks` weeks (Mon to Sun, Manila): head counts only. */
export const loadConfirmedWeeks = (weeks = 8, now: Date = new Date()) => guard<{ days: string[]; values: number[] }>(async () => {
  const ws = lastWeeks(weeks, now)
  const one = async (w: string) => {
    const a = dayStartIso(w), b = dayStartIso(addDays(w, 7))
    const [l, d] = await Promise.all(['lab_results', 'documents'].map((t) => head(supabase!.from(t).select('id', { count: 'exact', head: true }).eq('status', 'confirmed').gte('confirmed_at', a).lt('confirmed_at', b))))
    return l.ok && d.ok ? l.data + d.data : null
  }
  const v = await Promise.all(ws.map(one))
  return v.some((x) => x === null) ? bad : { ok: true, data: { days: ws, values: v as number[] } }
})

export const loadRecent = () => guard<AuditLite[]>(async () => {
  const { data, error } = await supabase!.from('audit_log').select('id, at, actor, tbl, person_id, action, fields').order('at', { ascending: false }).order('id', { ascending: false }).limit(10)
  return error ? bad : { ok: true, data: (data ?? []) as AuditLite[] }
})
