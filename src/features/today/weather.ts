import type { LatLon } from '../location/geo'
import { conditionWords, getForecast, useForecast, type Forecast } from '../weather/forecast'
import { rainLine, type Wx } from './heroCards'

// Lane M4: the forecast itself lives in features/weather/forecast.ts (one request, one cache, shared by every surface).
// This file keeps the small Wx shape Today, Safety and the Assistant already use, derived from that cache.

/** Hourly times stay in the place's own wall clock (with utcOffset), so a member abroad reads "from 3 PM" in the place's time, never Manila's. */
export function toWx(fc: Forecast, offline = false): Wx {
  const code = fc.current.code
  const hasT = fc.hourly.length > 0
  return {
    temp: fc.current.temp,
    rainPct: fc.daily[0]?.prob ?? null,
    words: conditionWords(code),
    at: fc.fetchedAt,
    code,
    hourly: hasT ? { time: fc.hourly.map((h) => h.time), prob: fc.hourly.map((h) => h.prob), code: fc.hourly.map((h) => h.code) } : undefined,
    high: fc.daily[0]?.max ?? null,
    low: fc.daily[0]?.min ?? null,
    utcOffset: fc.utcOffset,
    tz: fc.tz,
    humidity: fc.current.humidity,
    feels: fc.current.feels,
    uvMax: fc.daily[0]?.uvMax ?? null,
    offline
  }
}

export async function loadWeather(p: LatLon, f: typeof fetch = fetch): Promise<Wx> {
  const r = await getForecast(p, f)
  return toWx(r.fc, r.fromCache)
}

const MAX_AGE = 6 * 3600_000 // an older reading is not shown here: it could say clear in a storm

/** Latest weather for a point: cached reading first (works offline), then a fresh fetch. null until something is known. */
export function useWeather(p: LatLon | null): Wx | null {
  const { fc, offline } = useForecast(p)
  if (!fc || Date.now() - Date.parse(fc.fetchedAt) >= MAX_AGE) return null
  return toWx(fc, offline)
}

/** The one weather sentence for the app, e.g. "27° partly cloudy. Rain likely from 3 PM for about 2 hours. Chance: 80%."
 *  Today and Safety both use it so the numbers never disagree. null when the temperature is unknown (never a made-up 0). */
export function weatherLine(w: Wx | null, now: Date = new Date()): string | null {
  if (!w || w.temp == null) return null
  return `${Math.round(w.temp)}° ${w.words}. ${rainLine(w, now)}`
}
