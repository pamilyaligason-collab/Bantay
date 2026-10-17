export interface LatLon {
  lat: number
  lon: number
}
export interface Loc extends LatLon {
  source: 'gps' | 'home'
}

/** D-11 fallback: Barangay Dampas, Tagbilaran City, Bohol. */
export const DAMPAS = { name: 'Barangay Dampas, Tagbilaran City, Bohol', lat: 9.645705, lon: 123.877951 }

/** D-27: two home zones are always watched. Twin of ZONES in supabase/functions/alerts-ingest/parse.ts (a vitest keeps them equal). */
export const HOME_ZONES = [
  { id: 'dampas', name: 'Dampas, Tagbilaran City', lat: 9.645705, lon: 123.877951 },
  // Conel: OpenStreetMap Nominatim, q="Conel, General Santos City, Philippines" (2026-10-18), node 5333506060, place=village:
  // lat 6.2015121, lon 125.1878084. This is the barangay centre point from OSM, not a street address.
  { id: 'conel', name: 'Conel, General Santos City', lat: 6.2015121, lon: 125.1878084 }
] as const

/** The home zone nearest to p. */
export const nearestZone = (p: LatLon) => HOME_ZONES.reduce((a, b) => (distanceKm(p, b) < distanceKm(p, a) ? b : a))

/** Haversine distance in km. For re-ranking cards by nearness. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))
}
