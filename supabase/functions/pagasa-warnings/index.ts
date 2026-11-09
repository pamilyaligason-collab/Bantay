// PAGASA warnings reader (S26, D-163): reads three public PAGASA pages (cyclone bulletin, weather advisory, home page Active Warnings) -> public.pagasa_warnings. PAGASA stays the authority: the app links to the original.
// Not public: callable only with the PAGASA_CRON_SECRET in the x-pagasa-secret header (pg_cron + pg_net, same pattern as lotto-pcso). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): PAGASA_CRON_SECRET (32+ characters). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { type Port, runPagasa } from './pagasa.ts'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const MAX_PAGE = 4_000_000 // the home page is about 1.9 MB; a bigger answer is not it

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })
  const secret = Deno.env.get('PAGASA_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' }) // before any other work
  if (!same(req.headers.get('x-pagasa-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async upsert(rows) {
      const { error } = await sb.from('pagasa_warnings').upsert(rows, { onConflict: 'dedupe_key' })
      if (error) throw new Error('write')
    },
    async purge(beforeIso) {
      const { error } = await sb.from('pagasa_warnings').delete().lt('fetched_at', beforeIso)
      if (error) throw new Error('write')
    }
  }
  const fetchText = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'BantayFamilyApp/1.0', Accept: 'text/html' } })
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    const html = await res.text()
    if (html.length > MAX_PAGE) throw new Error('too_big')
    return html
  }
  let result
  try { result = await runPagasa(port, fetchText, Date.now()) } catch { result = { ok: false, rows: 0, failed: ['write'] } }
  // counts and flags only (heartbeat B-7): which source failed is a flag per name
  await heartbeat(sb, 'pagasa-warnings', result.ok, {
    rows: result.rows,
    failed: result.failed.length,
    bulletin_failed: result.failed.includes('bulletin'),
    advisory_failed: result.failed.includes('advisory'),
    home_failed: result.failed.includes('home')
  })
  return reply(result.ok ? 200 : 502, result)
})
