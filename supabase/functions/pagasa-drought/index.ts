// PAGASA drought outlook reader (S29, lane C): the public Droughtcaster JSON, one request per province -> public.pagasa_drought (the "Climate outlook" card on Today).
// Not public: callable only with the PAGASA_CRON_SECRET in the x-pagasa-secret header (pg_cron + pg_net, same pattern as pagasa-warnings; the secret is reused). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): PAGASA_CRON_SECRET (32+ characters), ALLOWED_ORIGIN (as the other functions). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { corsHeaders, json } from '../_shared/http.ts'
import { FETCH_TIMEOUT_MS, type Port, runDrought } from './drought.ts'
import { PROVINCES } from './provinces.ts'

const MAX_BODY = 200_000 // a real answer is under 1 KB; a bigger one is not it

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'bad_input' }, 405, cors)
  const secret = Deno.env.get('PAGASA_CRON_SECRET')
  if (!secret || secret.length < 32) return json({ ok: false, error: 'not_configured' }, 500, cors) // before any other work
  if (!same(req.headers.get('x-pagasa-secret') ?? '', secret)) return json({ ok: false, error: 'unauthorized' }, 401, cors)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async stored() {
      const { data, error } = await sb.from('pagasa_drought').select('province,fetched_at')
      if (error) throw new Error('read')
      return Object.fromEntries((data ?? []).map((r: { province: string; fetched_at: string }) => [r.province, r.fetched_at]))
    },
    async upsert(row) {
      const { error } = await sb.from('pagasa_drought').upsert(row, { onConflict: 'province' })
      if (error) throw new Error('write')
    }
  }
  const fetchJson = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'User-Agent': 'BantayFamilyApp/1.0', Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    const text = await res.text()
    if (text.length > MAX_BODY) throw new Error('too_big')
    return JSON.parse(text)
  }
  let result
  try { result = await runDrought(port, fetchJson, PROVINCES, Date.now()) } catch { result = { ok: false, rows: 0, failed: 0, skipped: 0 } }
  // counts only (heartbeat B-7)
  await heartbeat(sb, 'pagasa-drought', result.ok, { rows: result.rows, failed: result.failed, skipped: result.skipped })
  return json(result, result.ok ? 200 : 502, cors)
})
