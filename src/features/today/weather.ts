import { useEffect, useState } from 'react'
import { db } from '../../db'
import type { LatLon } from '../location/geo'
import { rainOutlook, type Wx } from './heroCards'

// Same Open-Meteo call as the assistant (features/assistant/weather.ts), kept structured here so the hero can show a number.
const CODE: [number, string][] = [[0, 'clear'], [3, 'partly cloudy'], [48, 'foggy'], [57, 'drizzle'], [67, 'rainy'], [77, 'snowy'], [82, 'rain showers'], [86, 'snow showers'], [99, 'thunderstorms']]
const words = (c: number) => CODE.find(([max]) => c <= max)?.[1] ?? 'unsettled'
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null) // unknown is null, never 0

export async function loadWeather(p: LatLon, f: typeof fetch = fetch): Promise<Wx> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code&daily=precipitation_probability_max&hourly=precipitation_probability,precipitation&timezone=Asia%2FManila&forecast_days=2`
  const res = await f(u)
  if (!res.ok) throw new Error(String(res.status))
  const j = (await res.json()) as { current?: { time?: string; temperature_2m?: unknown; weather_code?: unknown }; hourly?: { time?: unknown[]; precipitation_probability?: unknown[] }; daily?: { precipitation_probability_max?: unknown[] } }
  const code = num(j.current?.weather_code)
  return { temp: num(j.current?.temperature_2m), rainPct: num(j.daily?.precipitation_probability_max?.[0]), words: code == null ? 'unsettled' : words(code), at: new Date().toISOString(), code, rain: rainOutlook(j.hourly?.time, j.hourly?.precipitation_probability, j.current?.time) }
}

const KEY = 'today.weather'
const MAX_AGE = 6 * 3600_000 // an older reading is not shown: it could say clear in a storm
const near = (a: LatLon, b: LatLon) => Math.abs(a.lat - b.lat) < 0.2 && Math.abs(a.lon - b.lon) < 0.2

/** Latest weather for a point: cached reading first (works offline, says "as of"), then a fresh fetch. null until something is known. */
export function useWeather(p: LatLon | null): Wx | null {
  const [wx, setWx] = useState<Wx | null>(null)
  const lat = p?.lat
  const lon = p?.lon
  useEffect(() => {
    if (lat == null || lon == null) return
    const at = { lat, lon }
    let live = true
    void db.kv.get(KEY).then((r) => {
      const c = r?.value as { p: LatLon; wx: Wx } | undefined
      if (live && c && near(c.p, at) && Date.now() - new Date(c.wx.at).getTime() < MAX_AGE) setWx(c.wx)
    }, () => undefined)
    loadWeather(at).then((w) => {
      if (!live) return
      setWx(w)
      void db.kv.put({ key: KEY, value: { p: at, wx: w } }).catch(() => undefined)
    }, () => undefined)
    return () => { live = false }
  }, [lat, lon])
  return wx
}
