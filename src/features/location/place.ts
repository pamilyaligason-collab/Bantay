import { validZone } from '../time/zone'
import { distanceKm, HOME_NEAR_KM, HOME_ZONES, nearestZone, type HomePlace, type LatLon } from './geo'

export type ZoneId = (typeof HOME_ZONES)[number]['id']

// ponytail: bounding box, not the national border; upgrade to a polygon only if a member lives near the edge.
export const inPhilippines = (p: LatLon) => p.lat >= 4.2 && p.lat <= 21.3 && p.lon >= 116.0 && p.lon <= 127.0

/** A saved home place read back from storage: a name and a real position (not 0,0, not off the globe), a tz only when it is a real zone. null otherwise (unknown is null, ML-05). */
export function asHome(v: unknown): HomePlace | null {
  const h = v as Partial<HomePlace> | null | undefined
  if (!h || typeof h.name !== 'string' || !h.name.trim() || typeof h.lat !== 'number' || typeof h.lon !== 'number') return null
  if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon) || Math.abs(h.lat) > 90 || Math.abs(h.lon) > 180 || (h.lat === 0 && h.lon === 0)) return null
  const tz = validZone(h.tz)
  return { name: h.name.trim(), lat: h.lat, lon: h.lon, ...(tz ? { tz } : {}) }
}

/** Point that warnings are ranked from: the phone inside the Philippines, else the zone (never a foreign GPS point). */
export function alertRef(p: ReturnType<typeof resolvePlace>): LatLon {
  return p.source === 'gps' || p.source === 'last' ? p.weather : HOME_ZONES.find((z) => z.id === p.zone) ?? HOME_ZONES[0]
}

/** D-33: weather follows the phone when known; zone data uses the nearest home zone inside the Philippines,
 *  else the last zone the member chose. No position: the last zone for both.
 *  S30 L9 (F1): `home` is the member's own home place, only when it is outside the Philippines (the Philippine zones stay as they were). With no fresh position
 *  it stands in for the last Philippine zone for weather, place words and timezone (source 'home'); `zone` stays the Philippine zone, which is what Philippine alerts use. */
export function resolvePlace(o: { gps: (LatLon & { stale?: boolean }) | null; lastZone: ZoneId; home?: HomePlace | null }) {
  const last = HOME_ZONES.find((z) => z.id === o.lastZone) ?? HOME_ZONES[0]
  const away = o.home && !inPhilippines(o.home) ? o.home : null
  const noFix = () => (away ? { weather: { lat: away.lat, lon: away.lon }, zone: last.id as ZoneId, source: 'home' as const } : { weather: { lat: last.lat, lon: last.lon }, zone: last.id as ZoneId, source: 'zone' as const })
  if (!o.gps) return noFix()
  // an old fix from outside the Philippines is not where the phone is now: use the home place, else the zone
  if (o.gps.stale && !inPhilippines(o.gps)) return noFix()
  const weather = { lat: o.gps.lat, lon: o.gps.lon }
  if (!inPhilippines(o.gps)) return { weather, zone: last.id as ZoneId, source: 'gps-abroad' as const }
  return { weather, zone: nearestZone(o.gps).id as ZoneId, source: o.gps.stale ? ('last' as const) : ('gps' as const) }
}

// S7w: the weather surfaces are reached through this module (contract).
export { WeatherStrip } from '../today/WeatherCard'
export { default as RainMap } from '../weather/RainMap'

/** IANA time zone of a place. The forecast reports the real one (Open-Meteo `timezone=auto`); before it arrives, inside the Philippines
 *  it is Asia/Manila, anywhere else undefined (the phone's own zone). Never a fixed Manila for a member who is abroad. */
export function placeTimezone(p: LatLon, reported?: string | null): string | undefined {
  if (reported) return reported
  if (inPhilippines(p)) return 'Asia/Manila'
  return knownHome?.tz && distanceKm(p, knownHome) <= HOME_NEAR_KM ? knownHome.tz : undefined // the member's own home place knows its zone before the forecast does
}
/** The home place the place hooks last read from kv (set by usePlaceFrom), so placeTimezone can answer without a hook. */
let knownHome: HomePlace | null = null
export const setKnownHome = (h: HomePlace | null): void => { knownHome = h }
