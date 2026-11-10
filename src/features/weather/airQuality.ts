import { useEffect, useState } from 'react'
import { db } from '../../db'
import type { LatLon } from '../location/geo'
import { FETCH_TIMEOUT_MS } from './forecast'

// Cautions are the DENR statements, lightly shortened (no new advice).
// Philippine AQI (DENR DAO 2020-14): the 24-hour mean of PM2.5 (ug/m3), from Open-Meteo Air Quality, fetched from the phone (it allows CORS, like the forecast).
export interface Band { id: number; label: string; max: number; bg: string; ink: string; say: string | null } // bg/ink: a tinted chip, text 4.5:1 or better (airQuality.test.ts)
export const BANDS: Band[] = [
  { id: 1, label: 'Good', max: 25, bg: '#CDEBD8', ink: '#0F4D33', say: null },
  { id: 2, label: 'Fair', max: 35, bg: '#FBE9A6', ink: '#5C4400', say: null },
  { id: 3, label: 'Unhealthy for Sensitive Groups', max: 45, bg: '#FFD3A8', ink: '#7A3500', say: 'People with asthma or other breathing problems should limit hard activity outdoors.' },
  { id: 4, label: 'Very Unhealthy', max: 55, bg: '#FFC9C4', ink: '#8C1A12', say: 'Avoid heavy traffic areas. People with heart or breathing problems should stay indoors and rest. Postpone trips you do not need.' },
  { id: 5, label: 'Acutely Unhealthy', max: 90, bg: '#E2D2FA', ink: '#4B2A93', say: 'Everyone should limit hard activity outdoors. People with heart or breathing problems should stay indoors and rest. Postpone trips you do not need.' },
  { id: 6, label: 'Emergency', max: Infinity, bg: '#F3C1CF', ink: '#6E0F2E', say: 'Everyone should stay indoors with windows and doors closed, unless it is too hot.' }
]
export const MIN_HOURS = 18 // fewer readings than this in the 24 hours: unknown, not a guess

/** The band for a 24-hour mean. The mean is rounded to 0.1 first, so 25.04 is Good and 25.1 is Fair. */
export const bandOf = (pm: number): Band => { const v = Math.round(pm * 10) / 10; return BANDS.find((b) => v <= b.max)! }

/** Mean of the last 24 hourly pm2_5 values up to the place's current hour; null when fewer than MIN_HOURS are numbers. `nowLocalHour` is "YYYY-MM-DDTHH" in the place's time. */
export function pm25Mean(h: { time?: unknown; pm2_5?: unknown } | undefined, nowLocalHour: string): number | null {
  const t = Array.isArray(h?.time) ? (h!.time as unknown[]) : []
  const v = Array.isArray(h?.pm2_5) ? (h!.pm2_5 as unknown[]) : []
  const last = t.reduce<number>((a, x, i) => (typeof x === 'string' && x.slice(0, 13) <= nowLocalHour ? i : a), -1)
  const vals = v.slice(Math.max(0, last - 23), last + 1).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return last < 0 || vals.length < MIN_HOURS ? null : Math.round((vals.reduce((a, x) => a + x, 0) / vals.length) * 10) / 10
}

const r2 = (n: number) => Math.round(n * 100) / 100 // about 1 km: all that is sent
export const airUrl = (p: LatLon) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${r2(p.lat)}&longitude=${r2(p.lon)}&hourly=pm2_5&past_days=1&forecast_days=1&timezone=auto`

export const AIR_FRESH_MS = 60 * 60_000
export const AIR_KEEP_MS = 6 * 3600_000 // an older reading is not shown: a 24-hour mean that old would mislead
export interface Air { mean: number | null; fetchedAt: string }
const PREFIX = 'weather.air.'
export const AIR_PLACES = 5 // kv rows kept: the newest places only
const key = (p: LatLon) => `${PREFIX}${r2(p.lat)},${r2(p.lon)}`
const prune = async () => { const rows = (await db.kv.toArray()).filter((r) => r.key.startsWith(PREFIX)).sort((a, b) => Date.parse((b.value as Air).fetchedAt) - Date.parse((a.value as Air).fetchedAt)); for (const r of rows.slice(AIR_PLACES)) await db.kv.delete(r.key) }

/** Cached reading under 60 minutes old, else one request, else a cache under 6 hours old, else throws. */
export async function getAir(p: LatLon, f: typeof fetch = fetch, now = Date.now()): Promise<{ air: Air; stale: boolean }> {
  const k = key(p)
  const cached = await db.kv.get(k).then((r) => r?.value as Air | undefined).catch(() => undefined)
  const age = cached ? now - Date.parse(cached.fetchedAt) : NaN
  if (cached && age >= 0 && age < AIR_FRESH_MS) return { air: cached, stale: false }
  const ctl = new AbortController()
  const hung = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await f(airUrl(p), { signal: ctl.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = (await res.json()) as { hourly?: { time?: unknown; pm2_5?: unknown }; utc_offset_seconds?: unknown }
    const off = typeof j.utc_offset_seconds === 'number' ? j.utc_offset_seconds : 0
    const air: Air = { mean: pm25Mean(j.hourly, new Date(now + off * 1000).toISOString().slice(0, 13)), fetchedAt: new Date(now).toISOString() }
    await db.kv.put({ key: k, value: air }).then(prune).catch(() => undefined)
    return { air, stale: false }
  } catch (e) {
    if (cached && age >= 0 && age < AIR_KEEP_MS) return { air: cached, stale: true }
    throw e
  } finally { clearTimeout(hung) }
}

/** air: undefined = loading, null = could not be read. */
export function useAir(p: LatLon | null): { air: Air | null | undefined; stale: boolean } {
  const [s, setS] = useState<{ k: string; air: Air | null; stale: boolean } | null>(null)
  const lat = p?.lat; const lon = p?.lon
  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    const k = key({ lat, lon })
    getAir({ lat, lon }).then((r) => { if (live) setS({ k, air: r.air, stale: r.stale }) }, () => { if (live) setS({ k, air: null, stale: false }) })
    return () => { live = false }
  }, [lat, lon])
  const k = lat == null || lon == null ? '' : key({ lat, lon })
  return s && s.k === k ? s : { air: undefined, stale: false }
}
