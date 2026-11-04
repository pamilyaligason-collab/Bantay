// Daily safety digest (Phase 2 lane A). Not public: callable only with the ALERTS_CRON_SECRET (the same secret as alerts-ingest) in the x-alerts-secret header
// (pg_cron + pg_net at 06:45 Asia/Manila, see ops/sql/alerts_digest_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// Writes one safety_digests row per Manila day from the last 24 h of safety_alerts. No new secret. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { type DigestRow, officialFailed, type Port, runDigest } from './logic.ts'

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
  const secret = Deno.env.get('ALERTS_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' }) // before any other work
  if (!same(req.headers.get('x-alerts-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async rows(sinceIso, nowIso) {
      const { data, error } = await sb.from('safety_alerts').select('id,kind,level,title,source,issued_at,expires_at').or(`issued_at.gte.${sinceIso},expires_at.gt.${nowIso}`).limit(2000)
      if (error) throw new Error('read')
      return (data ?? []) as DigestRow[]
    },
    async lastRun() {
      const { data, error } = await sb.from('job_runs').select('ran_at,summary').eq('job', 'alerts-ingest').order('ran_at', { ascending: false }).limit(1)
      if (error) throw new Error('read')
      const r = data?.[0] as { ran_at?: string; summary?: Record<string, unknown> } | undefined
      return r?.ran_at ? { at: r.ran_at, failed: officialFailed(r.summary), eonetOk: r.summary?.eonet_ok === true, airOk: r.summary?.air_ok === true } : null
    },
    async upsert(day, body) {
      const { error } = await sb.from('safety_digests').upsert({ day, body, built_at: new Date().toISOString() }, { onConflict: 'day' })
      if (error) throw new Error('write')
    },
    async prune(beforeDay) {
      const { error } = await sb.from('safety_digests').delete().lt('day', beforeDay)
      if (error) throw new Error('write')
    }
  }
  try {
    const d = await runDigest(port, Date.now())
    await heartbeat(sb, 'alerts-digest', true, { warnings: Object.values(d.counts).reduce((n, c) => n + c, 0) })
    return reply(200, { ok: true, day: d.day })
  } catch {
    await heartbeat(sb, 'alerts-digest', false, {})
    return reply(502, { ok: false, error: 'failed' })
  }
})
