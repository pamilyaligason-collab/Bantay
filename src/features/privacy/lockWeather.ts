import { useEffect, useState } from 'react'
import { db } from '../../db'
import { distanceKm, HOME_ZONES } from '../location/geo'
import { conditionWords, kindOf, type Forecast, type Kind } from '../weather/forecast'

/** The lock-screen weather glance (mockup start-finger). Weather has no health or private data, so it is safe before unlocking.
 *  Read from the newest forecast already cached on this phone (works offline); no request, no location. null when nothing usable is cached. */
export interface Glance { temp: number; words: string; kind: Kind; rain: string | null; place?: string }

/** Cache key `weather.forecast.<lat>,<lon>` -> the home zone's name when that forecast is for a home zone (within 3 km); a GPS spot gets no name rather than a wrong one. */
export function placeOfKey(key: string): string | undefined {
  const [lat, lon] = key.replace('weather.forecast.', '').split(',').map(Number)
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return undefined
  return HOME_ZONES.find((z) => distanceKm({ lat, lon }, z) <= 3)?.name
}

const MAX_AGE = 12 * 3600_000 // an older reading could say clear in a storm

export function glanceOf(fc: Forecast, now = Date.now()): Glance | null {
  if (now - Date.parse(fc.fetchedAt) >= MAX_AGE || fc.current.temp == null) return null
  const here = new Date(now + fc.utcOffset * 1000).toISOString().slice(0, 13) + ':00' // the place's own wall-clock hour
  const next = fc.hourly.find((h) => h.time > here && (h.prob ?? 0) >= 60)
  const hr = next ? Number(next.time.slice(11, 13)) : null
  return {
    temp: Math.round(fc.current.temp), words: conditionWords(fc.current.code), kind: kindOf(fc.current.code),
    rain: hr == null ? null : `rain likely after ${hr % 12 || 12} ${hr >= 12 ? 'PM' : 'AM'}`
  }
}

export function useLockGlance(): Glance | null {
  const [g, setG] = useState<Glance | null>(null)
  useEffect(() => {
    let live = true
    void db.kv.where('key').startsWith('weather.forecast.').toArray().then((rows) => {
      const best = rows.map((r) => ({ key: r.key, f: r.value as Forecast })).filter((x) => x.f && typeof x.f.fetchedAt === 'string' && x.f.current && Array.isArray(x.f.hourly))
        .sort((a, b) => Date.parse(b.f.fetchedAt) - Date.parse(a.f.fetchedAt))[0]
      const g = best ? glanceOf(best.f) : null
      if (live && g && best) { const place = placeOfKey(best.key); setG(place ? { ...g, place } : g) }
    }).catch(() => undefined)
    return () => { live = false }
  }, [])
  return g
}
