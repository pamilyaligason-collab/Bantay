import { distanceKm, type Alert, type LatLon } from '../safety/alerts'
import { cyclones } from '../safety/LiveMaps'

export type Storm = Alert & { lat: number; lon: number }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** The storm to show on Today: the active GDACS cyclone nearest to `from` (newest when no place is known). Null hides the card.
 *  A storm with no coordinates cannot be placed on a map, so it is skipped here (Safety still lists it). */
export function pickStorm(alerts: Alert[], from: LatLon | null): Storm | null {
  const list = cyclones(alerts).filter((a): a is Storm => finite(a.lat) && finite(a.lon))
  if (!list.length) return null
  if (!from) return list[0]
  return list.reduce((best, a) => (distanceKm(from, a as LatLon) < distanceKm(from, best as LatLon) ? a : best))
}

export const STORM_NEAR_KM = 500
/** The storm for Next up: the nearest cyclone, only when it is within STORM_NEAR_KM of a known place. A far storm stays in Safety. */
export function nearbyStorm(alerts: Alert[], from: LatLon | null): Storm | null {
  const s = from ? pickStorm(alerts, from) : null
  return s && from && distanceKm(from, s as LatLon) <= STORM_NEAR_KM ? s : null
}

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
/** "about 420 km east of you". Null when the place is unknown. */
export function awayText(from: LatLon | null, s: LatLon): string | null {
  if (!from || !finite(from.lat) || !finite(from.lon)) return null
  const km = Math.round(distanceKm(from, s) / 10) * 10
  if (km < 20) return 'right over your area'
  const r = Math.PI / 180
  const y = Math.sin((s.lon - from.lon) * r) * Math.cos(s.lat * r)
  const x = Math.cos(from.lat * r) * Math.sin(s.lat * r) - Math.sin(from.lat * r) * Math.cos(s.lat * r) * Math.cos((s.lon - from.lon) * r)
  const deg = (Math.atan2(y, x) / r + 360) % 360
  return `about ${km} km ${DIRS[Math.round(deg / 45) % 8]} of you`
}

/** Map centre and Windy zoom (3..8) so both points are in view. With no place, centre on the storm. */
export function mapView(s: LatLon, from: LatLon | null): { lat: number; lon: number; zoom: number } {
  if (!from) return { lat: s.lat, lon: s.lon, zoom: 5 }
  const km = distanceKm(from, s)
  const zoom = km > 2500 ? 3 : km > 1200 ? 4 : km > 600 ? 5 : km > 300 ? 6 : km > 150 ? 7 : 8
  return { lat: (s.lat + from.lat) / 2, lon: (s.lon + from.lon) / 2, zoom }
}
