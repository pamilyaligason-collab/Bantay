// Safety broadcast (lane A3). Admin only. Sends web push {"t": id} to every stored subscription. Never logs the body.
// Function secrets (set by Lloyd): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, ALLOWED_ORIGIN.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// push_subscriptions columns (endpoint, p256dh, auth) follow lane A2's 0003_sync.sql.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
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
  if (isHazardId(t)) {
    const { data: people } = await service.from('people').select('id').not('auth_user_id', 'is', null).is('archived_at', null)
    for (const p of (people ?? []) as { id: string }[]) {
      const { data: n } = await service.rpc('notify_family', { p_person: p.id, p_kind: 'hazard', p_template: t, p_ref: hazardRef(t, Date.now()), p_scope: 'self' })
      rows += typeof n === 'number' ? n : 0
    }
  }
  const { data: subs, error } = await service.from('push_subscriptions').select('endpoint,p256dh,auth')
  if (error) return reply(500, { ok: false, error: 'failed' })
  if (!subs || subs.length === 0) return reply(200, { ok: true, sent: 0, removed: 0, rows })

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
  return reply(200, { ok: true, sent: results.filter((r) => r.status === 201).length, removed: gone.length, rows })
})
