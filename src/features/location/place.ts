import { HOME_ZONES, nearestZone, type LatLon } from './geo'

export type ZoneId = (typeof HOME_ZONES)[number]['id']

// ponytail: bounding box, not the national border; upgrade to a polygon only if a member lives near the edge.
export const inPhilippines = (p: LatLon) => p.lat >= 4.2 && p.lat <= 21.3 && p.lon >= 116.0 && p.lon <= 127.0

/** Point that warnings are ranked from: the phone inside the Philippines, else the zone (never a foreign GPS point). */
export function alertRef(p: ReturnType<typeof resolvePlace>): LatLon {
  return p.source === 'gps' ? p.weather : HOME_ZONES.find((z) => z.id === p.zone) ?? HOME_ZONES[0]
}

/** D-33: weather follows the phone when known; zone data uses the nearest home zone inside the Philippines,
 *  else the last zone the member chose. No position: the last zone for both. */
export function resolvePlace(o: { gps: LatLon | null; lastZone: ZoneId }) {
  const last = HOME_ZONES.find((z) => z.id === o.lastZone) ?? HOME_ZONES[0]
  if (!o.gps) return { weather: { lat: last.lat, lon: last.lon }, zone: last.id as ZoneId, source: 'zone' as const }
  if (!inPhilippines(o.gps)) return { weather: o.gps, zone: last.id as ZoneId, source: 'gps-abroad' as const }
  return { weather: o.gps, zone: nearestZone(o.gps).id as ZoneId, source: 'gps' as const }
}

// S7w: the weather surfaces are reached through this module (contract).
export { WeatherStrip } from '../today/WeatherCard'
export { default as RainMap } from '../weather/RainMap'

/** IANA time zone of a place. The forecast reports the real one (Open-Meteo `timezone=auto`); before it arrives, inside the Philippines
 *  it is Asia/Manila, anywhere else undefined (the phone's own zone). Never a fixed Manila for a member who is abroad. */
export function placeTimezone(p: LatLon, reported?: string | null): string | undefined {
  if (reported) return reported
  return inPhilippines(p) ? 'Asia/Manila' : undefined
}
