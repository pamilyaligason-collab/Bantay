// Hyperlocal weather blend (v13 lane Q). Signed-in family members only. POST {lat, lon} -> {ok, cached, stale?, ...Blended} (blend.ts).
// One fetch per ~1 km cell per 30 minutes, cached in weather_cells (0047, service role only) and shared by everyone in the cell.
// Function secrets (set by the owner): OPEN_WEATHER_API_KEY (optional: without it, or while it still returns 401, the blend is Open-Meteo + MET Norway),
// ALLOWED_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. Nothing here logs the key or a position.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders } from '../_shared/http.ts'
import { blend, type Blended, cellOf, gather, type MetCache, TTL_MS, USER_AGENT } from './blend.ts'
import { type StationRow, stationCheck } from './metar.ts'

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('Origin'))
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_input' })

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
  const { data: u } = await caller.auth.getUser()
  if (!u.user) return reply(401, { ok: false, error: 'not_signed_in' })
  const { data: member } = await caller.rpc('is_family_member')
  if (member !== true) return reply(403, { ok: false, error: 'not_family' })

  const cell = cellOf(await req.json().catch(() => null))
  if (!cell) return reply(400, { ok: false, error: 'bad_input' })

  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const now = Date.now()
  const { data: row, error: readErr } = await sb.from('weather_cells').select('payload,met,expires_at').eq('lat', cell.lat).eq('lon', cell.lon).maybeSingle()
  // A cache read error (a missing grant, a missing table) must not turn every open into a paid OpenWeather call: say so in the log and go without the paid source.
  if (readErr) console.error('weather_cells read failed', readErr.code ?? 'no_code')
  if (row && Date.parse(row.expires_at) > now) return reply(200, { ok: true, cached: true, ...(row.payload as Blended) })

  // shortcut: two members opening the same cell in the same second both fetch; fine at family scale, add a lock if cells ever get busy
  const got = await gather(cell, readErr ? undefined : Deno.env.get('OPEN_WEATHER_API_KEY') || undefined, fetch, now, (row?.met as MetCache | null) ?? null)
  if (!got.series.length) return row ? reply(200, { ok: true, cached: true, stale: true, ...(row.payload as Blended) }) : reply(502, { ok: false, error: 'no_source', sources: got.sources })

  const b = blend(got, cell, now)
  b.check = await stationCheck({
    async read(id) { const { data } = await sb.from('weather_stations').select('*').eq('station', id).maybeSingle(); return (data as StationRow | null) ?? null },
    async write(r) { await sb.from('weather_stations').upsert(r, { onConflict: 'station' }) },
    async fetchJson(u) { const r = await fetch(u, { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': USER_AGENT } }); if (!r.ok) throw new Error(`HTTP${r.status}`); return r.json() }
  }, cell, b.now.temp, now).catch(() => null) // the check is a nice-to-have; it never fails the forecast
  const { error: writeErr } = await sb.from('weather_cells').upsert({
    lat: cell.lat, lon: cell.lon, payload: b, met: got.met ?? null, sources: got.sources.filter((s) => s.ok).map((s) => s.id),
    fetched_at: new Date(now).toISOString(), expires_at: new Date(now + TTL_MS).toISOString()
  }, { onConflict: 'lat,lon' }) // a failed cache write still returns the forecast, but it is logged: without a cache every open would be a fresh paid call
  if (writeErr) console.error('weather_cells write failed', writeErr.code ?? 'no_code')
  await sb.from('weather_cells').delete().lt('expires_at', new Date(now - 86_400_000).toISOString()) // no trail of old cells
  return reply(200, { ok: true, cached: false, ...b })
})
