import { useEffect, useRef, useState } from 'react'
import type { Air, Alert, Blended, Check, Slot, Source } from '../../../supabase/functions/weather-blend/blend.ts'
import { db } from '../../db'
import { supabase } from '../auth/client'
import type { LatLon } from '../location/geo'
import { type Forecast, forecastKey, KEEP_MS, pruneForecasts, readCached, REFRESH_MS, useForecast } from './forecast'

// The server-side blend (lane Q: Open-Meteo + MET Norway + OpenWeather, median per hour, see supabase/functions/weather-blend).
// On for everyone through wxFlag('blend') (weather/flags.ts, Labs opt-out); this constant is only the hook's own default when no `on` is passed.
// Offline, not signed in, or the function down: the app's direct Open-Meteo forecast (forecast.ts), exactly as today.
export const WEATHER_BLEND_ON = false

export type Invoke = (body: LatLon) => Promise<unknown>
const invokeBlend: Invoke = async (body) => {
  if (!supabase) throw new Error('not_connected')
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) throw new Error('signed_out') // the function only answers family members: skip the round trip, go straight to the direct forecast
  const { data, error } = await supabase.functions.invoke('weather-blend', { body })
  if (error) throw error
  return data
}
export const BLEND_TIMEOUT_MS = 10_000 // the direct forecast gives up after 8 s; the blend gets a little more (three providers server side), then the screens fall back
const r2 = (n: number) => Math.round(n * 100) / 100 // the ~1 km cell is all that leaves the phone, as for Open-Meteo

export type Loaded = Blended & { stale?: boolean } // stale: every provider was down, this is the function's last cached cell
/** The blended forecast, also saved as this place's offline forecast (so Today, Safety and offline read the same numbers); throws when unavailable. */
export function loadBlended(p: LatLon, invoke: Invoke = invokeBlend): Promise<Loaded> {
  const k = forecastKey(p) // Today, Safety and Weather open together share one request (D-163)
  const hit = pending.get(k)
  if (hit && hit.invoke === invoke) return hit.run
  const run: Promise<Loaded> = loadBlendedOnce(p, invoke).finally(() => { if (pending.get(k)?.run === run) pending.delete(k) }) // only this run clears its entry
  pending.set(k, { invoke, run })
  return run
}
const pending = new Map<string, { invoke: Invoke; run: Promise<Loaded> }>()
async function loadBlendedOnce(p: LatLon, invoke: Invoke): Promise<Loaded> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline')
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('timeout')), BLEND_TIMEOUT_MS) })
  const d = (await Promise.race([invoke({ lat: r2(p.lat), lon: r2(p.lon) }), late]).finally(() => clearTimeout(timer))) as (Loaded & { ok?: boolean }) | null
  if (!d?.ok || !d.now || !Array.isArray(d.hourly48) || !Array.isArray(d.daily10) || !Array.isArray(d.next2h)) throw new Error('bad_blend')
  if (!(Date.now() - Date.parse(d.fetchedAt) < KEEP_MS)) throw new Error('too_old') // as readCached: hourly rain older than a day would be wrong
  if (!d.stale) void db.kv.put({ key: forecastKey(p), value: toForecast(d) }).then(() => pruneForecasts()).catch(() => undefined)
  return d
}

export const toForecast = (b: Blended): Forecast => ({ fetchedAt: b.fetchedAt, tz: b.tz, utcOffset: b.utcOffset, current: b.now, rainingNow: b.rainingNow ?? null, hourly: b.hourly48, daily: b.daily10 })

export interface BlendedState {
  fc: Forecast | null
  offline: boolean
  loading: boolean
  blended: boolean // false: the direct Open-Meteo forecast (credit Open-Meteo as today); sources is then empty
  next2h: Slot[] // 12 ten-minute slots; estimated = interpolated, not OpenWeather minutely
  aqi: Air | null
  alerts: Alert[] // OpenWeather government alerts; PAGASA's own (safety_alerts) rank first on screen
  sources: Source[] // per provider: ok or why not, credit text and link for the footer
  check: Check | null // "checked against Mactan-Cebu airport"
}

/** Blended weather when `on` (default WEATHER_BLEND_ON), else, or when the blend fails, the direct forecast. `invoke` must be stable (tests). */
export function useBlendedWeather(p: LatLon | null, o: { on?: boolean; invoke?: Invoke } = {}): BlendedState {
  const on = o.on ?? WEATHER_BLEND_ON
  const invoke = o.invoke
  const key = p ? forecastKey(p) : ''
  const lat = p?.lat
  const lon = p?.lon
  const [b, setB] = useState<{ key: string; data: Loaded | null; failed: boolean; cached: Forecast | null }>({ key: '', data: null, failed: false, cached: null })
  const latest = useRef(b)
  latest.current = b
  useEffect(() => {
    if (!on || lat == null || lon == null) return
    let live = true
    const k = forecastKey({ lat, lon })
    setB((x) => (x.key === k ? x : { key: k, data: null, failed: false, cached: null })) // a new place never shows the old place's numbers
    void readCached({ lat, lon }).then((c) => { if (live && c) setB((x) => (x.key === k && !x.data && !x.failed ? { ...x, cached: c } : x)) }) // cache first, as useForecast
    const load = () => loadBlended({ lat, lon }, invoke).then(
      (data) => { if (live) setB({ key: k, data, failed: false, cached: null }) },
      // a refresh that fails keeps what is on screen, marked stale (the offline word), until it is a day old
      () => { if (live) setB((x) => (x.key === k && x.data && Date.now() - Date.parse(x.data.fetchedAt) < KEEP_MS ? { ...x, data: { ...x.data, stale: true } } : { key: k, data: null, failed: true, cached: x.key === k ? x.cached : null })) }
    )
    void load()
    // stay fresh as the direct forecast does: on return to the app, when the network comes back, and on a timer; a reading under 10 minutes old is kept
    const onShow = () => { const d = latest.current.data; if (document.visibilityState !== 'hidden' && (!d || d.stale || Date.now() - Date.parse(d.fetchedAt) >= 600_000)) void load() }
    document.addEventListener('visibilitychange', onShow)
    addEventListener('online', onShow)
    const timer = setInterval(onShow, REFRESH_MS)
    return () => { live = false; document.removeEventListener('visibilitychange', onShow); removeEventListener('online', onShow); clearInterval(timer) }
  }, [on, lat, lon, invoke])
  const mine = key !== '' && b.key === key
  const direct = useForecast(!on || (mine && b.failed) ? p : null)
  if (on && mine && b.data) {
    const d = b.data
    return { fc: toForecast(d), offline: !!d.stale, loading: false, blended: true, next2h: d.next2h, aqi: d.aqi, alerts: d.alerts, sources: d.sources, check: d.check }
  }
  const none = { blended: false, next2h: [], aqi: null, alerts: [], sources: [], check: null }
  if (on && !(mine && b.failed)) return { fc: mine ? b.cached : null, offline: false, loading: true, ...none } // blend pending
  const held = !direct.fc && mine ? b.cached : null
  return { ...direct, fc: direct.fc ?? held, offline: direct.offline || (!!held && !direct.loading), ...none } // the cached reading stays on screen while the direct forecast reads its own
}
