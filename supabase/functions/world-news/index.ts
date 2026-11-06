// World headlines and Discover news ingest (W6, D-135): public RSS feeds, no key. Not public: callable only with the WORLD_NEWS_CRON_SECRET in the x-world-news-secret header
// (pg_cron + pg_net, see ops/sql/world_news_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): WORLD_NEWS_CRON_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { type Port, runNews } from './news.ts'

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
  const secret = Deno.env.get('WORLD_NEWS_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' }) // before any other work
  if (!same(req.headers.get('x-world-news-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async upsertWorld(rows) {
      const { error } = await sb.from('world_news').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error('write')
    },
    async upsertItems(rows) {
      const { error } = await sb.from('news_items').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error('write')
    },
    async purge(beforeIso) {
      const a = await sb.from('world_news').delete().lt('seen_at', beforeIso)
      const b = await sb.from('news_items').delete().like('id', 'rss-%').lt('published_at', beforeIso) // only this function's rows
      if (a.error || b.error) throw new Error('write')
    }
  }
  const fetchText = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'FamilyBantay/1.0', Accept: 'application/rss+xml, application/xml, text/xml' } })
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    return await res.text() // not RSS (an error page) parses to null and counts as a failed feed
  }
  let result
  try { result = await runNews(port, fetchText, Date.now()) } catch { result = { ok: false, rows: 0, items: 0, queries_ok: 0, queries_failed: 0 } }
  await heartbeat(sb, 'world-news', result.ok, { rows: result.rows, items: result.items, queries_ok: result.queries_ok, queries_failed: result.queries_failed })
  return reply(result.ok ? 200 : 502, result)
})
