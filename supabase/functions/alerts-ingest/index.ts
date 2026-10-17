// Official safety alerts ingest (D-25). Not public: callable only with the ALERTS_CRON_SECRET in the x-alerts-secret header
// (pg_cron + pg_net, see ops/sql/alerts_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by Lloyd): ALERTS_CRON_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { type Existing, type Port, runIngest } from './ingest.ts'

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
    async existing(source) {
      const { data, error } = await sb.from('safety_alerts').select('id,bulletin,previous_bulletin').eq('source', source)
      if (error) throw new Error('read')
      const m: Existing = new Map()
      for (const r of data ?? []) m.set(r.id, { bulletin: r.bulletin, previous_bulletin: r.previous_bulletin })
      return m
    },
    async upsert(rows) {
      if (!rows.length) return
      const { error } = await sb.from('safety_alerts').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error('write')
    },
    async setStale(source, stale) {
      const { error } = await sb.from('safety_alerts').update({ stale }).eq('source', source)
      if (error) throw new Error('write')
    }
  }
  const fetchText = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'FamilyBantay-alerts/1.0' } })
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    return res.text()
  }
  return reply(200, { ok: true, sources: await runIngest(port, fetchText, Date.now()) })
})
