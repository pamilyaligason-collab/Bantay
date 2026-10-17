export interface LatLon {
  lat: number
  lon: number
}
export interface Loc extends LatLon {
  source: 'gps' | 'home'
}

/** D-11 fallback: Barangay Dampas, Tagbilaran City, Bohol. */
export const DAMPAS = { name: 'Barangay Dampas, Tagbilaran City, Bohol', lat: 9.645705, lon: 123.877951 }

/** Haversine distance in km. For re-ranking cards by nearness. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))
}
