// Watch shelves video ingest (S33): reads the public YouTube RSS feeds of trusted channels once a day, no key. Not public: callable only with the WATCH_CRON_SECRET in the x-watch-secret header
// (pg_cron + pg_net, same pattern as da-prices and yt-feed). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): WATCH_CRON_SECRET (32+ characters). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { OEMBED, type Port, runWatch } from './feed.ts'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

const HEADERS = { 'User-Agent': 'FamilyBantay/1.0 (+watch shelves)' }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })
  const secret = Deno.env.get('WATCH_CRON_SECRET')
  if (!secret || secret.length < 32) return reply(500, { ok: false, error: 'not_configured' }) // before any other work
  if (!same(req.headers.get('x-watch-secret') ?? '', secret)) return reply(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const port: Port = {
    async upsert(rows) {
      const { error } = await sb.from('watch_videos').upsert(rows, { onConflict: 'video_id' })
      if (error) throw new Error('write')
    },
    async purge(beforeIso) {
      const { error } = await sb.from('watch_videos').delete().lt('published_at', beforeIso)
      if (error) throw new Error('write')
    }
  }
  const fetchText = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { ...HEADERS, Accept: 'application/atom+xml' } })
    if (!res.ok) throw new Error(`HTTP${res.status}`)
    return await res.text()
  }
  const playable = async (id: string) => {
    const res = await fetch(OEMBED + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: AbortSignal.timeout(8_000), headers: HEADERS })
    await res.body?.cancel() // only the status matters
    return res.status === 200
  }
  let result
  try { result = await runWatch(port, fetchText, playable, Date.now()) } catch { result = { ok: false } } // counts unknown after a throw: none rather than zeros
  await heartbeat(sb, 'watch-feed', result.ok, { rows: result.rows, kept: result.kept, dropped: result.dropped, channels_ok: result.channels_ok, channels_failed: result.channels_failed })
  return reply(result.ok ? 200 : 502, result)
})
