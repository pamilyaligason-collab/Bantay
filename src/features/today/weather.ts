import type { LatLon } from '../location/geo'
import { conditionWords, getForecast, useForecast, type Forecast } from '../weather/forecast'
import { rainLine, type Wx } from './heroCards'

// Lane M4: the forecast itself lives in features/weather/forecast.ts (one request, one cache, shared by every surface).
// This file keeps the small Wx shape Today, Safety and the Assistant already use, derived from that cache.

const MANILA_S = 8 * 3600

/** Place-local "YYYY-MM-DDTHH:MM" -> Manila wall clock, because the existing rain helpers compare against manilaLocal(). */
const toManila = (t: string, offsetS: number): string => {
  if (offsetS === MANILA_S) return t
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(t)
  if (!m) return t
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - offsetS * 1000 + MANILA_S * 1000
  return new Date(ms).toISOString().slice(0, 16)
}

export function toWx(fc: Forecast): Wx {
  const code = fc.current.code
  const hasT = fc.hourly.length > 0
  return {
    temp: fc.current.temp,
    rainPct: fc.daily[0]?.prob ?? null,
    words: conditionWords(code),
    at: fc.fetchedAt,
    code,
    hourly: hasT ? { time: fc.hourly.map((h) => toManila(h.time, fc.utcOffset)), prob: fc.hourly.map((h) => h.prob) } : undefined
  }
}

export async function loadWeather(p: LatLon, f: typeof fetch = fetch): Promise<Wx> {
  return toWx((await getForecast(p, f)).fc)
}

const MAX_AGE = 6 * 3600_000 // an older reading is not shown here: it could say clear in a storm

/** Latest weather for a point: cached reading first (works offline), then a fresh fetch. null until something is known. */
export function useWeather(p: LatLon | null): Wx | null {
  const { fc } = useForecast(p)
  if (!fc || Date.now() - Date.parse(fc.fetchedAt) >= MAX_AGE) return null
  return toWx(fc)
}

/** The one weather sentence for the app, e.g. "27° partly cloudy. Rain likely from 3 PM for about 2 hours. Chance: 80%."
 *  Today and Safety both use it so the numbers never disagree. null when the temperature is unknown (never a made-up 0). */
export function weatherLine(w: Wx | null, now: Date = new Date()): string | null {
  if (!w || w.temp == null) return null
  return `${Math.round(w.temp)}° ${w.words}. ${rainLine(w, now)}`
}
