import { useEffect, useState } from 'react'
import { db } from '../../db'
import type { LatLon } from '../location/geo'

// The one forecast for the whole app: one Open-Meteo request per place, cached in kv with the time it was fetched.
// Today, Safety, the Assistant and the Weather screen all read it through here, so the numbers never disagree.

export interface Hour { time: string; temp: number | null; prob: number | null; code: number | null } // time: place-local "YYYY-MM-DDTHH:00"
export interface Day { date: string; code: number | null; min: number | null; max: number | null; prob: number | null; uvMax: number | null; sunrise: string | null; sunset: string | null } // sunrise, sunset: place-local "YYYY-MM-DDTHH:MM"
export interface Forecast {
  fetchedAt: string // ISO, when the request succeeded
  tz: string // IANA name Open-Meteo resolved for the place, e.g. "Asia/Manila"
  utcOffset: number // seconds
  current: { time: string; temp: number | null; humidity: number | null; feels: number | null; code: number | null; wind: number | null; gust: number | null; uv: number | null }
  hourly: Hour[]
  daily: Day[]
}

export const FORECAST_DAYS = 10
const FRESH_MS = 10 * 60_000 // a reading younger than this is reused, so five screens do not make five requests
const KEEP_MS = 24 * 3600_000 // an older cached forecast is not shown (hourly rain would be wrong)
const r2 = (n: number) => Math.round(n * 100) / 100 // about 1 km: all that is sent to the weather service

export const forecastUrl = (p: LatLon) =>
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${r2(p.lat)}&longitude=${r2(p.lon)}` +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,uv_index' +
  '&hourly=temperature_2m,precipitation_probability,weather_code' +
  '&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,uv_index_max,sunrise,sunset' +
  `&forecast_days=${FORECAST_DAYS}&timezone=auto`

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null) // unknown is null, never 0
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const CODE: [number, string][] = [[0, 'clear'], [3, 'partly cloudy'], [48, 'foggy'], [57, 'drizzle'], [67, 'rainy'], [77, 'snowy'], [82, 'rain showers'], [86, 'snow showers'], [99, 'thunderstorms']]
/** WMO weather code in plain words. */
export const conditionWords = (c: number | null): string => (c == null ? 'unsettled' : CODE.find(([max]) => c <= max)?.[1] ?? 'unsettled')
export type Kind = 'sun' | 'cloud' | 'rain' | 'storm' | 'fog'
export const kindOf = (c: number | null): Kind => (c == null ? 'cloud' : c <= 1 ? 'sun' : c <= 3 ? 'cloud' : c <= 48 ? 'fog' : c >= 95 ? 'storm' : c <= 77 || c >= 80 ? 'rain' : 'cloud')

export function parseForecast(j: unknown, fetchedAt: string): Forecast | null {
  const o = (j ?? {}) as Record<string, Record<string, unknown> | string | number | undefined>
  const cur = (o.current ?? {}) as Record<string, unknown>
  const h = (o.hourly ?? {}) as Record<string, unknown>
  const d = (o.daily ?? {}) as Record<string, unknown>
  const ht = arr(h.time)
  const dt = arr(d.time)
  if (!o.current || typeof o.current !== 'object' || !ht.every((t) => typeof t === 'string')) return null // hourly and daily may be missing: the screen then leaves those sections out
  return {
    fetchedAt,
    tz: str(o.timezone) || 'Asia/Manila',
    utcOffset: num(o.utc_offset_seconds) ?? 0,
    current: { time: str(cur.time), temp: num(cur.temperature_2m), humidity: num(cur.relative_humidity_2m), feels: num(cur.apparent_temperature), code: num(cur.weather_code), wind: num(cur.wind_speed_10m), gust: num(cur.wind_gusts_10m), uv: num(cur.uv_index) },
    hourly: ht.map((t, i) => ({ time: t as string, temp: num(arr(h.temperature_2m)[i]), prob: num(arr(h.precipitation_probability)[i]), code: num(arr(h.weather_code)[i]) })),
    daily: Array.from({ length: Math.max(dt.length, arr(d.precipitation_probability_max).length) }, (_, i) => ({ date: str(dt[i]), code: num(arr(d.weather_code)[i]), min: num(arr(d.temperature_2m_min)[i]), max: num(arr(d.temperature_2m_max)[i]), prob: num(arr(d.precipitation_probability_max)[i]), uvMax: num(arr(d.uv_index_max)[i]), sunrise: str(arr(d.sunrise)[i]) || null, sunset: str(arr(d.sunset)[i]) || null }))
  }
}

const KEEP_PLACES = 5 // forecasts kept for at most this many places; the oldest is dropped
const PREFIX = 'weather.forecast.'

/** Keep only the `keep` most recently fetched forecasts (a phone that travels would otherwise cache every place it has been). */
export async function pruneForecasts(keep = KEEP_PLACES): Promise<void> {
  try {
    const rows = await db.kv.where('key').startsWith(PREFIX).toArray()
    const age = (r: { value: unknown }) => { const t = Date.parse((r.value as Forecast | undefined)?.fetchedAt ?? ''); return Number.isNaN(t) ? 0 : t }
    const old = rows.sort((a, b) => age(b) - age(a)).slice(keep)
    if (old.length) await db.kv.bulkDelete(old.map((r) => r.key))
  } catch { /* the cache is a convenience */ }
}

export const forecastKey = (p: LatLon) => `${PREFIX}${r2(p.lat)},${r2(p.lon)}`

export async function readCached(p: LatLon, now = Date.now()): Promise<Forecast | null> {
  try {
    const c = (await db.kv.get(forecastKey(p)))?.value as Forecast | undefined
    const t = c ? Date.parse(c.fetchedAt) : NaN
    return c && Array.isArray(c.hourly) && Array.isArray(c.daily) && now - t < KEEP_MS && t <= now + 60_000 ? c : null
  } catch { return null }
}

export interface Result { fc: Forecast; fromCache: boolean } // fromCache: the network failed, this is the last good forecast ("as of ...")
const inflight = new Map<string, Promise<Result>>()

/** Fresh cached forecast if under 10 minutes old, else one request (shared by every caller), else the older cache, else throws. */
export function getForecast(p: LatLon, f: typeof fetch = fetch, o: { force?: boolean; now?: number } = {}): Promise<Result> {
  const key = forecastKey(p)
  const hit = inflight.get(key)
  if (hit) return hit
  const run = (async (): Promise<Result> => {
    const now = o.now ?? Date.now()
    const cached = await readCached(p, now)
    if (cached && !o.force && now - Date.parse(cached.fetchedAt) < FRESH_MS) return { fc: cached, fromCache: false }
    try {
      const res = await f(forecastUrl(p))
      if (!res.ok) throw new Error(String(res.status))
      const fc = parseForecast(await res.json(), new Date(now).toISOString())
      if (!fc) throw new Error('bad forecast')
      void db.kv.put({ key, value: fc }).then(() => pruneForecasts()).catch(() => undefined)
      return { fc, fromCache: false }
    } catch (e) {
      if (cached) return { fc: cached, fromCache: true }
      throw e
    }
  })().finally(() => inflight.delete(key))
  inflight.set(key, run)
  return run
}

export interface ForecastState { fc: Forecast | null; offline: boolean; loading: boolean }

/** Cached forecast first (works offline), then a fresh one. `offline` is true when the refresh failed and the cache is what you see. */
export function useForecast(p: LatLon | null): ForecastState {
  const [s, setS] = useState<ForecastState & { key: string }>({ fc: null, offline: false, loading: true, key: '' })
  const lat = p?.lat
  const lon = p?.lon
  useEffect(() => {
    if (lat == null || lon == null) return
    const at = { lat, lon }
    const key = forecastKey(at)
    let live = true
    setS((x) => (x.key === key ? x : { fc: null, offline: false, loading: true, key }))
    void readCached(at).then((c) => { if (live && c) setS((x) => (x.fc ? x : { fc: c, offline: false, loading: true, key })) })
    getForecast(at).then(
      (r) => { if (live) setS({ fc: r.fc, offline: r.fromCache, loading: false, key }) },
      () => { if (live) setS((x) => ({ ...x, offline: !!x.fc, loading: false, key })) }
    )
    return () => { live = false }
  }, [lat, lon])
  return s
}

/** The place's wall clock now, "YYYY-MM-DDTHH:MM", from the phone clock and the place's UTC offset (works from a cached forecast). */
export const nowLocal = (fc: Forecast, now = Date.now()): string => new Date(now + fc.utcOffset * 1000).toISOString().slice(0, 16)

/** Hourly entries from the current place-local hour on, up to `n`. */
export const hoursFrom = (fc: Forecast, n: number, now = Date.now()): Hour[] => {
  const at = nowLocal(fc, now).slice(0, 13)
  const i = fc.hourly.findIndex((h) => h.time.slice(0, 13) >= at)
  return i < 0 ? [] : fc.hourly.slice(i, i + n)
}

/** "Saved for offline · updated 6:00 AM": the forecast is kept on the phone, this says how old it is. */
export const savedLine = (fc: Forecast): string => `Saved for offline · updated ${clockIn(fc.fetchedAt, fc.tz)}`

/** "7:20 PM" in the place's own time zone. */
export const clockIn = (iso: string, tz?: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const f = (timeZone?: string) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone }).replace(/\s/g, ' ').toUpperCase()
  try { return f(tz) } catch { return f() }
}
