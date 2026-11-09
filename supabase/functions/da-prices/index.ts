// DA daily price index ingest (S26, D-164): the Department of Agriculture Daily Price Index PDF for the National Capital Region (labelled NCR, not the user's town)
// -> public.da_prices (Today / market price card). No key. Not public: callable only with the DA_CRON_SECRET in the x-da-secret header
// (pg_cron + pg_net, same pattern as lotto-pcso). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): DA_CRON_SECRET (32+ characters). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { extractItems } from './extract.ts'
import { type Port, runDaPrices } from './prices.ts'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const MAX_PDF = 5_000_000 // the real file is about 100 KB; a bigger answer is not it

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

const get = (url: string, accept: string) => fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'FamilyBantay/1.0 (+market prices card)', Accept: accept } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })
  const secret = Deno.env.get('DA_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' }) // before any other work
  if (!same(req.headers.get('x-da-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async upsert(rows) {
      const { error } = await sb.from('da_prices').upsert(rows, { onConflict: 'price_date,commodity,specification' })
      if (error) throw new Error('write')
    },
    async purge(beforeDate) {
      const { error } = await sb.from('da_prices').delete().lt('price_date', beforeDate)
      if (error) throw new Error('write')
    }
  }
  const fetchText = async (url: string) => {
    const res = await get(url, 'text/html')
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    return await res.text()
  }
  const fetchItems = async (url: string) => {
    const res = await get(url, 'application/pdf')
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length > MAX_PDF) throw new Error('too_big')
    return await extractItems(buf)
  }
  let result
  try { result = await runDaPrices(port, fetchText, fetchItems, Date.now()) } catch { result = { ok: false, rows: 0 } }
  await heartbeat(sb, 'da-prices', result.ok, { rows: result.rows })
  return reply(result.ok ? 200 : 502, result)
})
