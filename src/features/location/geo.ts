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

/* ---- Quick dial areas (PART-3 4.1). A separate list from HOME_ZONES: adding a city here never changes alert watching. ---- */
export interface CircleArea { id: string; name: string; kind: 'circle'; lat: number; lon: number; radiusKm: number }
export interface BoxArea { id: string; name: string; kind: 'box'; south: number; north: number; west: number; east: number }
export type HotlineArea = CircleArea | BoxArea
/** City-centre points are the usual city-centre coordinates (Wikipedia / OpenStreetMap place nodes, rounded to 4 decimals, about 10 m).
 *  30 km circles; Manila is 25 km so it does not swallow nearby cities. Texas is the state bounding box. */
export const HOTLINE_AREAS: readonly HotlineArea[] = [
  { id: 'gensan', name: 'General Santos', kind: 'circle', lat: 6.1164, lon: 125.1716, radiusKm: 30 },
  { id: 'tagbilaran', name: 'Tagbilaran', kind: 'circle', lat: 9.6472, lon: 123.8556, radiusKm: 30 },
  { id: 'davao', name: 'Davao', kind: 'circle', lat: 7.0731, lon: 125.6128, radiusKm: 30 },
  { id: 'cebu', name: 'Cebu City', kind: 'circle', lat: 10.3157, lon: 123.8854, radiusKm: 30 },
  { id: 'manila', name: 'Manila', kind: 'circle', lat: 14.5995, lon: 120.9842, radiusKm: 25 },
  // Texas: US Census state extent, south 25.84 (Brownsville), north 36.50 (Panhandle), west -106.65 (El Paso), east -93.51 (Sabine River).
  { id: 'texas', name: 'Texas', kind: 'box', south: 25.84, north: 36.5, west: -106.65, east: -93.51 }
]

// Same bounding box as inPhilippines() in place.ts (place.ts imports this file, so it is repeated here instead of imported).
const inPh = (p: LatLon) => p.lat >= 4.2 && p.lat <= 21.3 && p.lon >= 116.0 && p.lon <= 127.0

export type LocalSet = { where: 'area'; area: HotlineArea } | { where: 'ph' } | { where: 'abroad' }

/** Which one local set shows. Inside one area: that area. Inside two circles: the nearer centre. No area: 'ph' (inside the
 *  Philippines box) or 'abroad'. A box has no centre; it only wins when no circle holds the point. */
export function pickLocalSet(p: LatLon, areas: readonly HotlineArea[] = HOTLINE_AREAS): LocalSet {
  const hits = areas.filter((a) => (a.kind === 'circle' ? distanceKm(p, a) <= a.radiusKm : p.lat >= a.south && p.lat <= a.north && p.lon >= a.west && p.lon <= a.east))
  const circles = hits.filter((a): a is CircleArea => a.kind === 'circle')
  if (circles.length) return { where: 'area', area: circles.reduce((a, b) => (distanceKm(p, b) < distanceKm(p, a) ? b : a)) }
  if (hits[0]) return { where: 'area', area: hits[0] }
  return { where: inPh(p) ? 'ph' : 'abroad' }
}
