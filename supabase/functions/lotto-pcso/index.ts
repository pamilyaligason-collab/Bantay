// PCSO lotto results ingest (S24, D-152): reads the public results page, no key. Not public: callable only with the LOTTO_CRON_SECRET in the x-lotto-secret header
// (pg_cron + pg_net, same pattern as world-news). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): LOTTO_CRON_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { type Port, runLotto } from './lotto.ts'

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
  const secret = Deno.env.get('LOTTO_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' }) // before any other work
  if (!same(req.headers.get('x-lotto-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async upsert(rows) {
      const { error } = await sb.from('lotto_results').upsert(rows, { onConflict: 'game,draw_date' })
      if (error) throw new Error('write')
    },
    async purge(beforeDate) {
      const { error } = await sb.from('lotto_results').delete().lt('draw_date', beforeDate)
      if (error) throw new Error('write')
    }
  }
  const fetchText = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'FamilyBantay/1.0', Accept: 'text/html' } })
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    return await res.text()
  }
  let result
  try { result = await runLotto(port, fetchText, Date.now()) } catch { result = { ok: false, rows: 0 } }
  await heartbeat(sb, 'lotto-pcso', result.ok, { rows: result.rows })
  return reply(result.ok ? 200 : 502, result)
})
