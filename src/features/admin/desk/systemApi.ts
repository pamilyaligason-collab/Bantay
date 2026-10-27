import { supabase } from '../../auth/client'
import { rpc } from '../api'
import migrations from '../../../data/migrations.json'
import { addDays, ago, manilaDay, type Res } from './homeApi'
import type { Tone } from './ui'

// System health (S8, D-78): is everything working for the family? Counts and states only: no health value, no message text, no other person's alert rows.
// Each loader is one card's data, so a card can fail on its own. The red / amber rules are plain functions so tests can pin them.
const NO = { ok: false, error: 'not_connected' } as const
const bad = { ok: false, error: 'failed' } as const
async function guard<T>(f: () => PromiseLike<Res<T>>): Promise<Res<T>> { if (!supabase) return NO; try { return await f() } catch { return bad } }

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

// ---------- Scheduled jobs ----------
export type JobRun = { job: string; ran_at: string; ok: boolean }
/** The jobs that call heartbeat() (contract). Red when the last run failed or is older than `staleMin` (30 by default: every job here runs at least every 15).
 *  The alerts feed gets 60, the same hour the app uses to call alerts out of date (safety/alerts.ts FRESH_AMBER_MIN), so the desk and the phones go red together. */
export const ALERTS_FEED_STALE_MIN = 60
export const JOBS = [
  { job: 'dose-watch', label: 'Missed-dose watch', every: 'Every 15 min', staleMin: 30 },
  { job: 'alerts-ingest', label: 'Official alerts feed', every: 'Every 10 min', staleMin: ALERTS_FEED_STALE_MIN },
  { job: 'records-extract', label: 'Records reader', every: 'Every 10 min', staleMin: 30 }
] as const
export const JOB_STALE_MIN = 30

export function jobStatus(run: JobRun | null | undefined, now = Date.now(), staleMin: number = JOB_STALE_MIN): { tone: Tone; text: string } {
  if (!run) return { tone: 'warn', text: 'No run recorded yet' } // unknown, not red: the job may simply not be deployed yet
  const t = Date.parse(run.ran_at)
  if (Number.isNaN(t)) return { tone: 'warn', text: 'Last run unreadable' }
  if (!run.ok) return { tone: 'bad', text: `Failed ${clock(run.ran_at)}` }
  if (now - t > staleMin * 60_000) return { tone: 'bad', text: `Stopped, last ran ${ago(run.ran_at, now)}` }
  return { tone: 'ok', text: clock(run.ran_at) }
}

export const loadJobRuns = () => guard<Record<string, JobRun | null>>(async () => {
  const one = async (job: string) => {
    const { data, error } = await supabase!.from('job_runs').select('job, ran_at, ok').eq('job', job).order('ran_at', { ascending: false }).limit(1)
    return error ? undefined : ((data ?? [])[0] as JobRun | undefined) ?? null
  }
  const rs = await Promise.all(JOBS.map((j) => one(j.job)))
  if (rs.some((r) => r === undefined)) return bad
  return { ok: true, data: Object.fromEntries(JOBS.map((j, i) => [j.job, rs[i] as JobRun | null])) }
})

// ---------- Alarm health per phone ----------
export type PhoneRow = {
  user_id: string; platform: 'android' | 'web' | null; app_version: string | null
  alarms_ok: boolean | null; notif_ok: boolean | null; exact_ok: boolean | null; battery_ok: boolean | null; call_ok: boolean | null
  oem: string | null; last_open_at: string | null; alarms_checked_at: string | null
}
const IDLE_H = 48

/** Unknown (null) is never a problem on its own: an old app or the browser app simply has no alarm check (ML-05). */
export function phoneStatus(p: PhoneRow, now = Date.now()): { tone: Tone; text: string } {
  const open = p.last_open_at ? Date.parse(p.last_open_at) : NaN
  const idleDays = !Number.isNaN(open) && now - open > IDLE_H * 3_600_000 ? Math.floor((now - open) / 86_400_000) : null
  const idle = idleDays != null ? ` · not opened for ${idleDays} ${idleDays === 1 ? 'day' : 'days'}` : ''
  if (p.platform === 'web') return { tone: 'warn', text: `Browser app: no alarms · alerts wait until it is opened${idle}` }
  const oem = p.oem ? `${p.oem} ` : ''
  let tone: Tone, text: string
  if (p.alarms_ok === false) {
    tone = 'bad'
    text = p.battery_ok === false ? `${oem}battery saver is on, alarms will be late. Turn it off for Bantay`
      : p.exact_ok === false ? 'Exact alarms are off. Allow them in Settings'
      : p.notif_ok === false ? 'Notifications are off. Turn them on in Settings'
      : 'Alarms may not ring. Open Bantay on that phone to re-check'
  } else if (p.alarms_ok == null) {
    tone = 'warn'; text = 'Old app: no alarm check yet. Update to the new Bantay app'
  } else if (p.battery_ok === false) { tone = 'warn'; text = `${oem}battery saver is on, may delay alarms` }
  else if (p.exact_ok === false) { tone = 'warn'; text = 'Exact alarms are off, may delay alarms' }
  else if (p.notif_ok === false) { tone = 'warn'; text = 'Notifications are off' }
  else { tone = 'ok'; text = p.alarms_checked_at && !Number.isNaN(Date.parse(p.alarms_checked_at)) ? `Alarms on, last checked ${clock(p.alarms_checked_at)}` : 'Alarms on' }
  return { tone: idle && tone === 'ok' ? 'warn' : tone, text: text + idle }
}

const RANK: Record<Tone, number> = { bad: 0, warn: 1, plain: 2, ok: 3 }
/** Problems first, then by name. */
export function sortPhones<T extends { tone: Tone; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => RANK[a.tone] - RANK[b.tone] || a.name.localeCompare(b.name))
}

export const loadPhones = () => guard<PhoneRow[]>(async () => {
  const { data, error } = await supabase!.from('phone_health')
    .select('user_id, platform, app_version, alarms_ok, notif_ok, exact_ok, battery_ok, call_ok, oem, last_open_at, alarms_checked_at')
  return error ? bad : { ok: true, data: (data ?? []) as PhoneRow[] }
})

// ---------- Client errors ----------
export type ErrRow = { where_: string; message_hash: string; app_version: string | null; count: number; day: string }
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number.isFinite(Number(x)) ? Number(x) : 0)

/** Errors in the last 7 Manila days by app version, most first. A row with no version counts as 'unknown'. `kinds` = different errors. */
export function errorsByVersion(rows: ErrRow[], today: string): { version: string; errors: number; kinds: number }[] {
  const from = addDays(today, -6)
  const m = new Map<string, { errors: number; hashes: Set<string> }>()
  for (const r of rows) {
    if (r.day < from || r.day > today) continue
    const v = r.app_version || 'unknown'
    const e = m.get(v) ?? { errors: 0, hashes: new Set<string>() }
    e.errors += n(r.count); e.hashes.add(`${r.where_}:${r.message_hash}`)
    m.set(v, e)
  }
  return [...m].map(([version, e]) => ({ version, errors: e.errors, kinds: e.hashes.size })).sort((a, b) => b.errors - a.errors || a.version.localeCompare(b.version))
}
export function errorTotals(rows: ErrRow[], today: string) {
  const y = addDays(today, -1)
  return { today: rows.filter((r) => r.day === today).reduce((a, r) => a + n(r.count), 0), yesterday: rows.filter((r) => r.day === y).reduce((a, r) => a + n(r.count), 0) }
}
/** Amber only when today is worse than yesterday; a quiet or steady day stays plain. */
export const errorsTone = (t: { today: number; yesterday: number }): Tone => (t.today > t.yesterday ? 'warn' : 'plain')
export function errorsNote(t: { today: number; yesterday: number }): string {
  const d = t.today - t.yesterday
  return d === 0 ? 'same as yesterday' : d > 0 ? `${d} more than yesterday` : `${-d} fewer than yesterday`
}

export const loadClientErrors = (now: Date = new Date()) => guard<ErrRow[]>(async () => {
  const since = addDays(manilaDay(now), -13)
  const { data, error } = await supabase!.from('client_errors').select('where_, message_hash, app_version, count, day').gte('day', since).limit(5000)
  return error ? bad : { ok: true, data: (data ?? []) as ErrRow[] }
})

// ---------- Weekly numbers and alert reach ----------
export type AlertStats = { sent: number; due_1h: number; seen: number; seen_1h: number; unseen_by_kind: Record<string, number>; by_day: { day: string; total: number; seen_1h: number }[] }
export type Pair = { cur: number; prev: number }
export type Kpis = { today: string; active_members: Pair; screens: Pair; doses_logged: Pair; readings_logged: Pair; client_errors: Pair; alerts: AlertStats | null }

/** Same list as the carer_alerts.kind check, NotifyKind and the templates.ts map (ML-28): add a kind to all four together. */
export const ALERT_KINDS: Record<string, string> = {
  dose_missed: 'Missed doses', review_open: 'Medicine questions', phone_health: 'Phone warnings', reading_high: 'High readings', mood_unwell: 'Not feeling well',
  hazard: 'Storm and hazard warnings', sos: 'SOS', sos_cancel: 'SOS cancelled', digest: 'Daily summaries', pin_approve: 'PIN approvals', pin_changed: 'PIN changes', system: 'System problems',
  share: 'Sharing offers', rollcall: 'Storm roll call', kudos: 'Kudos'
}

/** Share of alerts (at least an hour old) opened within an hour, in whole percent. Null when there is nothing to judge: unknown, never 0. */
export function seenRate(a: AlertStats | null | undefined): number | null {
  if (!a || !(a.due_1h > 0)) return null
  return Math.round((100 * a.seen_1h) / a.due_1h)
}
/** 90 and up fine, 70 to 89 amber, under 70 red. Unknown stays plain. */
export const seenTone = (rate: number | null): Tone => (rate == null ? 'plain' : rate >= 90 ? 'ok' : rate >= 70 ? 'warn' : 'bad')

/** Alerts nobody has opened in the last 7 days, by kind, most first. The D-78 trade-off made visible. */
export function unseenList(a: AlertStats | null | undefined): { kind: string; label: string; n: number }[] {
  return Object.entries(a?.unseen_by_kind ?? {}).map(([kind, c]) => ({ kind, label: ALERT_KINDS[kind] ?? kind, n: n(c) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n || x.kind.localeCompare(y.kind))
}

/** Per-day share of alerts opened within an hour, oldest first. A day with no due alert is null (nothing to judge), never 0. */
export function dayRates(a: AlertStats | null | undefined): { day: string; rate: number | null; total: number }[] {
  return [...(a?.by_day ?? [])].sort((x, y) => x.day.localeCompare(y.day)).map((d) => ({ day: d.day, total: n(d.total), rate: n(d.total) > 0 ? Math.round((100 * n(d.seen_1h)) / n(d.total)) : null }))
}
/** The day with the lowest rate (earliest on a tie), or null when no day can be judged. */
export function lowestDay(rates: { day: string; rate: number | null }[]): { day: string; rate: number } | null {
  let low: { day: string; rate: number } | null = null
  for (const r of rates) if (r.rate != null && (low == null || r.rate < low.rate)) low = { day: r.day, rate: r.rate }
  return low
}

/** The one line on the dashboard home: how many alerts the family opened. Null (nothing shown) when reach is unknown, e.g. before 0030 is applied. */
export function seenLine(a: AlertStats | null | undefined): { tone: Tone; text: string } | null {
  if (!a) return null
  if (a.sent === 0) return { tone: 'plain', text: 'No alerts were sent in the last 7 days.' }
  const unseen = unseenList(a).reduce((x, y) => x + y.n, 0)
  const tail = unseen > 0 ? ` · ${unseen} not opened yet` : ''
  const rate = seenRate(a)
  if (rate == null) return { tone: 'plain', text: `${a.sent} ${a.sent === 1 ? 'alert' : 'alerts'} sent, too new to judge${tail}` }
  return { tone: seenTone(rate), text: `${rate}% of alerts opened within 1 hour (${a.seen_1h} of ${a.due_1h}), last 7 days${tail}` }
}

export const loadKpis = () => guard<Kpis>(async () => {
  const r = await rpc<Kpis>('admin_weekly_kpis')
  const d = r.ok ? (r.data as Partial<Kpis>) : null
  return r.ok && d && d.active_members && d.client_errors ? { ok: true, data: { ...(d as Kpis), alerts: d.alerts ?? null } } : bad
})

// ---------- Pending database updates ----------
export const KNOWN_MIGRATIONS: string[] = migrations
/** Versions in src/data/migrations.json that the live database has not recorded (0028 is intentionally absent and always skipped). */
export const loadPendingMigrations = () => guard<string[]>(async () => {
  const r = await rpc<string[]>('admin_pending_migrations', { p_known: KNOWN_MIGRATIONS })
  return r.ok ? { ok: true, data: (Array.isArray(r.data) ? r.data : []).map(String) } : bad
})

// ---------- Sidebar dot ----------
/** Problems the admin can act on: jobs that are red. One cheap query per job; failing leaves the dot off (unknown, not zero). */
export const loadSystemBadge = (now = Date.now()) => guard<number>(async () => {
  const r = await loadJobRuns()
  if (!r.ok) return bad
  return { ok: true, data: JOBS.filter((j) => { const s = jobStatus(r.data[j.job], now, j.staleMin); return s.tone === 'bad' }).length }
})
