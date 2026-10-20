// Missed-dose watch (lane M7b). Not public: callable only with DOSE_WATCH_CRON_SECRET in the x-dose-watch-secret header
// (pg_cron + pg_net every 15 minutes, see ops/sql/dose_watch_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// For each active timed medicine whose slot was due 2 h ago with no taken or skipped row, ONE web push per person, slot and day
// goes to the writer carers. Payload {t:'dose_watch', n:<first name>}: no medicine name or value (B-7).
// Advisory only: the slot is CLAIMED before the push goes out (so two runs never send twice), which means a push lost on the network or
// by the push service is not repeated. The one exception: if every send threw a network error, the claim is released and the next run retries.
// Only medicines already confirmed ("Yes, still taking it", schedule.review not true) are watched.
// Function secrets (set by Lloyd): DOSE_WATCH_CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { type MedRow, type Port, runDoseWatch, type TakenRow } from './logic.ts'

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })
  const secret = Deno.env.get('DOSE_WATCH_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' })
  if (!same(req.headers.get('x-dose-watch-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })
  const vapid = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].map((k) => Deno.env.get(k))
  if (vapid.some((v) => !v)) return reply(500, { ok: false, error: 'not_configured' })
  webpush.setVapidDetails(vapid[0]!, vapid[1]!, vapid[2]!)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async medications() {
      return pages<MedRow>((from, to) => sb.from('medications').select('id,person_id,name,med_status,deleted_at,as_needed,schedule,started_on,stopped_on').is('deleted_at', null).eq('med_status', 'active').eq('as_needed', false).order('id').range(from, to))
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
    async subs(userIds) {
      const { data, error } = await sb.from('push_subscriptions').select('user_id,endpoint,p256dh,auth').in('user_id', userIds)
      if (error) throw new Error('read')
      return (data ?? []).filter((s: { p256dh: string | null; auth: string | null }) => s.p256dh && s.auth)
    },
    async claim(personId, day, slot) {
      const { data, error } = await sb.rpc('dose_watch_claim', { p_person: personId, p_day: day, p_slot: slot })
      if (error) throw new Error('write')
      return data === true
    },
    async release(personId, day, slot) {
      await sb.from('dose_watch_sent').delete().eq('person_id', personId).eq('day', day).eq('slot', slot)
    },
    async push(sub, payload) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh!, auth: sub.auth! } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
        return 201
      } catch (e) {
        return (e as { statusCode?: number }).statusCode ?? null
      }
    },
    async removeSub(endpoint) {
      await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
    }
  }
  try {
    const report = await runDoseWatch(port, Date.now())
    await sb.rpc('dose_watch_prune')
    return reply(200, { ok: true, ...report })
  } catch {
    return reply(500, { ok: false, error: 'failed' })
  }
})
