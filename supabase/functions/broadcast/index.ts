// Safety broadcast (lane A3). Admin only. Sends web push {"t": id} to every stored subscription, and (lane E, D-85) the same template by FCM to every Android token. Never logs the body.
// Function secrets (set by Lloyd): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, ALLOWED_ORIGIN; FIREBASE_SERVICE_ACCOUNT_B64 (optional until Firebase is set up).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// push_subscriptions columns (endpoint, p256dh, auth) follow lane A2's 0003_sync.sql.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { fcmMessageFor, fcmOutcome, parseServiceAccount, sendFcm } from '../_shared/fcm.ts'
import { corsHeaders } from '../_shared/http.ts'
import { goneEndpoints, hazardRef, isHazardId, parseBody } from './logic.ts'

// ALLOWED_ORIGIN may be a comma list (C1); the reply echoes the matching origin only.

Deno.serve(async (req) => {
  const cors = (): Record<string, string> => corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('Origin'))
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(), 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })

  const vapid = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].map((k) => Deno.env.get(k))
  if (vapid.some((v) => !v)) return reply(500, { ok: false, error: 'not_configured' }) // before any database access
  const url = Deno.env.get('SUPABASE_URL')!
  const auth = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: u } = await caller.auth.getUser()
  if (!u.user) return reply(401, { ok: false, error: 'not_admin' })
  const { data: isAdmin } = await caller.rpc('is_admin')
  if (isAdmin !== true) return reply(403, { ok: false, error: 'not_admin' })

  const t = parseBody(await req.json().catch(() => null))
  if (!t) return reply(400, { ok: false, error: 'bad_input' })

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  // D-78: the Android app has no push, so a hazard broadcast is also a row in every member's alert list (template id only, B-7). Before 0030 is applied
  // notify_family does not exist: that is logged as zero rows, never a failure of the web push below.
  let rows = 0
  const hazardAt = Date.now() // one instant: the ref the rows were written with is the ref the mark looks for
  if (isHazardId(t)) {
    const ref = hazardRef(t, hazardAt)
    const { data: people } = await service.from('people').select('id').not('auth_user_id', 'is', null).is('archived_at', null)
    for (const p of (people ?? []) as { id: string }[]) {
      const { data: n } = await service.rpc('notify_family', { p_person: p.id, p_kind: 'hazard', p_template: t, p_ref: ref, p_scope: 'self' })
      rows += typeof n === 'number' ? n : 0
    }
  }
  const { data: subs, error } = await service.from('push_subscriptions').select('endpoint,p256dh,auth')
  if (error) return reply(500, { ok: false, error: 'failed' }) // rows stay unmarked: dose-watch's flush still offers them
  // The direct push below already reaches every subscription; mark the rows offered so dose-watch's flush does not push the same alert again within 15 minutes.
  // A failed mark is not fatal (a repeat push replaces itself by tag; a missed safety push would not come back): it is reported as marked:false.
  let marked = true
  if (rows && isHazardId(t)) {
    const { error: me } = await service.from('carer_alerts').update({ pushed_at: new Date().toISOString() }).eq('kind', 'hazard').eq('ref', hazardRef(t, hazardAt)).is('pushed_at', null)
    marked = !me
  }
  let sent = 0
  let removed = 0
  if (subs && subs.length > 0) {
    webpush.setVapidDetails(vapid[0]!, vapid[1]!, vapid[2]!)
    const payload = JSON.stringify({ t }) // B-7: the template id and nothing else
    const results = await Promise.all(subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' })
        return { endpoint: s.endpoint, status: 201 as number | null }
      } catch (e) {
        return { endpoint: s.endpoint, status: (e as { statusCode?: number }).statusCode ?? null }
      }
    }))
    const gone = goneEndpoints(results)
    if (gone.length) await service.from('push_subscriptions').delete().in('endpoint', gone)
    sent = results.filter((r) => r.status === 201).length
    removed = gone.length
  }

  // FCM (D-85): the same template to every Android token of a member who is not disabled. Skipped until FIREBASE_SERVICE_ACCOUNT_B64 is set and 0040 is applied.
  // The title and body are the template text with no name (B-7); one send is capped at 8 s inside sendFcm and all run at once.
  let fcmSent = 0
  const sa = parseServiceAccount(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_B64'))
  if (sa) {
    const tk = await service.from('push_tokens').select('token,user_id')
    const off = await service.from('app_roles').select('user_id').eq('disabled', true)
    const disabled = new Set(((off.error ? [] : off.data ?? []) as { user_id: string }[]).map((r) => r.user_id))
    const tokens = ((tk.error ? [] : tk.data ?? []) as { token: string; user_id: string }[]).filter((r) => !disabled.has(r.user_id))
    const msg = fcmMessageFor({ kind: isHazardId(t) ? 'hazard' : 'sos', template: t }, new Date())
    if (msg && tokens.length) {
      const outcomes = await Promise.all(tokens.map(async (r) => ({ token: r.token, o: fcmOutcome(await sendFcm(sa, r.token, msg)) })))
      fcmSent = outcomes.filter((x) => x.o === 'ok').length
      const gone = outcomes.filter((x) => x.o === 'gone').map((x) => x.token)
      if (gone.length) await service.from('push_tokens').delete().in('token', gone)
    }
  }
  return reply(200, { ok: true, sent, removed, fcmSent, rows, ...(marked ? {} : { marked: false }) })
})
