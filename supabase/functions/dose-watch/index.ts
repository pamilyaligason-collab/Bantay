// Missed-dose watch + family alert delivery (lanes M7b, S1). Not public: callable only with DOSE_WATCH_CRON_SECRET in the x-dose-watch-secret header
// (pg_cron + pg_net every 15 minutes, see ops/sql/dose_watch_cron.sql; the 0031/0035 triggers and alerts-ingest call it with body {"mode":"flush"}).
// Deploy with --no-verify-jwt; the secret is the gate.
// Normal run: runDoseWatch (S4 logic.ts) -> flushWebPush -> phone-health sweep -> dose_due push -> prune -> heartbeat.
// mode 'flush': only flushWebPush, so PWA users get a push for a new carer_alerts row at once. APK users see the row when they open Bantay (D-78).
// Payloads are template ids only (B-7): {t}, or {t:'dose_watch', n:<first name>} for a missed dose. pushed_at means "offered"; the in-app row is the record.
// Function secrets (set by Lloyd): DOSE_WATCH_CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. Optional: DOSE_WATCH_AFTER_MIN (default 30).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { heartbeat } from '../_shared/heartbeat.ts'
import { TEMPLATES } from '../_shared/templates.ts'
import { firstName, manilaDay, normaliseDrug, recipients, runDoseWatch, scheduleTimes, type MedRow, type Port, type Report, type TakenRow } from './logic.ts'

const PAGE = 1000
/** Read every row, PAGE at a time (the API caps one response at 1000 rows). */
async function pages<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1)
    if (error) throw new Error('read')
    all.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return all
  }
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

/** The port S4's logic.ts receives gains carerRow (a typed parameter, not an import). */
type PortExt = Port & { carerRow(kind: string, personId: string, carerUserIds: string[], template: string, ref: string): Promise<void> }
/** S4's runDoseWatch may take the "missed after" minutes as a third argument; this build passes it and an older logic.ts ignores it. */
type RunFn = (port: Port, nowMs: number, opts?: { afterMin?: number }) => Promise<Report>

const FLUSH_MAX = 100 // rows per run (ML-23: no more than one run can finish)
const FLUSH_FRESH_MS = 12 * 3600_000 // an alert older than this is not pushed any more; the in-app row stays
const SEND_TIMEOUT_MS = 8000
const BUDGET_MS = 100_000 // measured from the start of the request; no send starts after this, and one send takes at most SEND_TIMEOUT_MS (ML-24, wall clock 150 s)
const DOSE_DUE_WINDOW_MS = 15 * 60_000 // one cron tick; the notification tag makes a repeat replace, not double

interface SubRow { user_id: string; endpoint: string; p256dh: string | null; auth: string | null }
interface AlertPushRow { id: string; person_id: string | null; carer_user_id: string; template: string }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })
  const secret = Deno.env.get('DOSE_WATCH_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' })
  if (!same(req.headers.get('x-dose-watch-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })
  const vapid = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].map((k) => Deno.env.get(k))
  if (vapid.some((v) => !v)) return reply(500, { ok: false, error: 'not_configured' })
  webpush.setVapidDetails(vapid[0]!, vapid[1]!, vapid[2]!)
  const reqStart = Date.now()
  const overBudget = () => Date.now() - reqStart > BUDGET_MS
  const body = await req.json().catch(() => null)
  const flushOnly = !!body && typeof body === 'object' && (body as { mode?: unknown }).mode === 'flush'

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const subsOf = async (userIds: string[]): Promise<SubRow[]> => {
    if (!userIds.length) return []
    const { data, error } = await sb.from('push_subscriptions').select('user_id,endpoint,p256dh,auth').in('user_id', userIds)
    if (error) throw new Error('read')
    return ((data ?? []) as SubRow[]).filter((s) => s.p256dh && s.auth)
  }
  const send = async (sub: SubRow, payload: object, urgent: boolean): Promise<number | null> => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh!, auth: sub.auth! } }, JSON.stringify(payload), { TTL: 3600, urgency: urgent ? 'high' : 'normal', timeout: SEND_TIMEOUT_MS })
      return 201
    } catch (e) {
      return (e as { statusCode?: number }).statusCode ?? null
    }
  }
  const removeSub = async (endpoint: string) => { await sb.from('push_subscriptions').delete().eq('endpoint', endpoint) }

  const port: PortExt = {
    async medications() {
      return pages<MedRow>((from, to) => sb.from('medications').select('id,person_id,name,med_status,deleted_at,as_needed,schedule,started_on,stopped_on,people!inner(archived_at)').is('deleted_at', null).eq('med_status', 'active').eq('as_needed', false).is('people.archived_at', null).order('id').range(from, to))
    },
    async taken(sinceIso) {
      return pages<TakenRow>((from, to) => sb.from('meds_taken').select('person_id,medication_id,slot,taken_at,name').gte('taken_at', sinceIso).order('id').range(from, to))
    },
    async person(id) {
      const { data } = await sb.from('people').select('display_name,auth_user_id').eq('id', id).maybeSingle()
      return data ?? null
    },
    async carers(personId) {
      const { data, error } = await sb.from('carers').select('carer_id,person_id,can_write').eq('person_id', personId).eq('can_write', true)
      if (error) throw new Error('read')
      return data ?? []
    },
    async subs(userIds) { return subsOf(userIds) },
    async claim(personId, day, slot) {
      const { data, error } = await sb.rpc('dose_watch_claim', { p_person: personId, p_day: day, p_slot: slot })
      if (error) throw new Error('write')
      return data === true
    },
    async release(personId, day, slot) {
      await sb.from('dose_watch_sent').delete().eq('person_id', personId).eq('day', day).eq('slot', slot)
    },
    async push(sub, payload) { return send(sub as SubRow, payload, true) },
    async removeSub(endpoint) { await removeSub(endpoint) },
    // One carer_alerts row per carer. A row with the same (kind, ref, carer) already exists: ignored (unique violation 23505), never an error.
    async carerRow(kind, personId, carerUserIds, template, ref) {
      for (const uid of carerUserIds) {
        const { error } = await sb.from('carer_alerts').insert({ person_id: personId, carer_user_id: uid, kind, template, ref })
        if (error && (error as { code?: string }).code !== '23505') throw new Error('write')
      }
    }
  }

  /** Web Push for rows not yet offered (browser/PWA users only). Sets pushed_at either way. Returns the number of pushes accepted. */
  async function flushWebPush(now: Date): Promise<{ pushed: number }> {
    const { data, error } = await sb.from('carer_alerts').select('id,person_id,carer_user_id,template').is('pushed_at', null).gt('expires_at', now.toISOString()).gt('created_at', new Date(now.getTime() - FLUSH_FRESH_MS).toISOString()).order('created_at', { ascending: false }).limit(FLUSH_MAX)
    if (error) throw new Error('read')
    const rows = (data ?? []) as AlertPushRow[]
    if (!rows.length) return { pushed: 0 }
    const subs = await subsOf([...new Set(rows.map((r) => r.carer_user_id))])
    const personIds = [...new Set(rows.filter((r) => r.template === 'dose_missed' && r.person_id).map((r) => r.person_id!))]
    const names = new Map<string, string | null>()
    if (personIds.length) {
      const { data: ps } = await sb.from('people').select('id,display_name').in('id', personIds)
      for (const p of (ps ?? []) as { id: string; display_name: string | null }[]) names.set(p.id, p.display_name)
    }
    let pushed = 0
    const offered: string[] = []
    rowLoop: for (const r of rows) {
      if (overBudget()) break // left unpushed: the next run continues
      const known = Object.hasOwn(TEMPLATES, r.template)
      const payload = r.template === 'dose_missed' && r.person_id ? { t: 'dose_watch', n: firstName(names.get(r.person_id)) } : known ? { t: r.template } : null
      if (payload) {
        const urgent = known && TEMPLATES[r.template as keyof typeof TEMPLATES].tone === 'urgent'
        for (const sub of subs.filter((s) => s.user_id === r.carer_user_id)) {
          if (overBudget()) break rowLoop // this row is not marked: the next run offers it again (the notification tag makes a repeat replace)
          const status = await send(sub, payload, urgent)
          if (status != null && status >= 200 && status < 300) pushed++
          else if (status === 404 || status === 410) await removeSub(sub.endpoint)
        }
      }
      offered.push(r.id)
    }
    if (offered.length) {
      const { error: we } = await sb.from('carer_alerts').update({ pushed_at: now.toISOString() }).in('id', offered)
      if (we) throw new Error('write') // unmarked rows would be pushed again for 12 h: report the run as failed
    }
    return { pushed }
  }

  /** A phone whose alarms are known to fail (alarms_ok = false) or that has not been opened for 48 h: one row per phone per Manila day for its writer carers.
   *  Unknown (null) is never a problem (ML-05). The table is missing before 0032 is applied: that is "nothing to sweep", not a failure. */
  async function sweepPhoneHealth(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - 48 * 3600_000).toISOString()
    const bad = await sb.from('phone_health').select('user_id').eq('alarms_ok', false).limit(500)
    const stale = await sb.from('phone_health').select('user_id').lt('last_open_at', cutoff).limit(500)
    if (bad.error && stale.error) return 0
    const users = [...new Set([...(bad.data ?? []), ...(stale.data ?? [])].map((r: { user_id: string }) => r.user_id))]
    let made = 0
    for (const uid of users) {
      const { data: p } = await sb.from('people').select('id,archived_at').eq('auth_user_id', uid).maybeSingle()
      if (!p || p.archived_at) continue
      const to = recipients(p.id, await port.carers(p.id), uid)
      if (!to.length) continue
      await port.carerRow('phone_health', p.id, to, 'phone_health', `${uid}:${manilaDay(now.getTime())}`)
      made++
    }
    return made
  }

  /** hazard M4: at each slot, a Web Push {t:'dose_due'} to the person's own browser/PWA subscriptions, unless the slot is already taken or skipped,
   *  or their phone is the Android app (phone_health.platform 'android': its local alarm rings). shortcut: the dedupe is the 15 minute window plus the
   *  notification tag, not a stored claim; upgrade if the cron ever runs more often than every 15 minutes. */
  async function doseDue(now: Date): Promise<number> {
    const day = manilaDay(now.getTime())
    const meds = await port.medications()
    const taken = await port.taken(new Date(now.getTime() - 86_400_000).toISOString())
    const slots = new Set<string>() // person|slot
    const open = (m: MedRow, t: string) => !taken.some((r) => r.person_id === m.person_id && r.slot === t && manilaDay(Date.parse(r.taken_at)) === day && (r.medication_id ? r.medication_id === m.id : !!normaliseDrug(r.name) && normaliseDrug(r.name) === normaliseDrug(m.name)))
    for (const m of meds) {
      for (const t of scheduleTimes(m.schedule)) {
        const late = now.getTime() - Date.parse(`${day}T${t}:00+08:00`)
        if (late >= 0 && late < DOSE_DUE_WINDOW_MS && open(m, t)) slots.add(`${m.person_id}|${t}`)
      }
    }
    const personIds = [...new Set([...slots].map((s) => s.split('|')[0]!))]
    if (!personIds.length) return 0
    const { data: ps } = await sb.from('people').select('id,auth_user_id').in('id', personIds)
    const owners = ((ps ?? []) as { id: string; auth_user_id: string | null }[]).filter((p) => p.auth_user_id)
    if (!owners.length) return 0
    const uids = owners.map((o) => o.auth_user_id!)
    const ph = await sb.from('phone_health').select('user_id,platform').in('user_id', uids)
    const android = new Set(((ph.error ? [] : ph.data ?? []) as { user_id: string; platform: string | null }[]).filter((r) => r.platform === 'android').map((r) => r.user_id))
    const subs = await subsOf(uids.filter((u) => !android.has(u)))
    let sent = 0
    for (const o of owners) {
      const count = [...slots].filter((s) => s.startsWith(`${o.id}|`)).length
      if (!count) continue
      for (const sub of subs.filter((s) => s.user_id === o.auth_user_id)) {
        if (overBudget()) return sent
        const status = await send(sub, { t: 'dose_due' }, false)
        if (status != null && status >= 200 && status < 300) sent++
        else if (status === 404 || status === 410) await removeSub(sub.endpoint)
      }
    }
    return sent
  }

  const now = new Date()
  if (flushOnly) {
    try { return reply(200, { ok: true, mode: 'flush', ...(await flushWebPush(now)) }) } catch { return reply(500, { ok: false, error: 'failed' }) }
  }
  const summary: Record<string, unknown> = {}
  let ok = true
  const step = async <T,>(name: string, fn: () => Promise<T>) => { try { summary[name] = await fn() } catch { ok = false; summary[`${name}_failed`] = true } }
  try {
    const afterMin = Number(Deno.env.get('DOSE_WATCH_AFTER_MIN') ?? 30)
    const report = await (runDoseWatch as RunFn)(port, now.getTime(), { afterMin: Number.isFinite(afterMin) && afterMin > 0 ? afterMin : 30 })
    Object.assign(summary, report)
    await step('flush', () => flushWebPush(now))
    await step('phone_health', () => sweepPhoneHealth(now))
    await step('dose_due', () => doseDue(now))
    await sb.rpc('dose_watch_prune')
    await heartbeat(sb, 'dose-watch', ok, summary)
    return reply(200, { ok, ...summary })
  } catch {
    await heartbeat(sb, 'dose-watch', false, { error: 'failed' })
    return reply(500, { ok: false, error: 'failed' })
  }
})
