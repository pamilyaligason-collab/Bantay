import { HOME_ZONES, distanceKm, type LatLon } from './geo'

/** S28: the exact place, offline. No network geocoder: the only barangay centre points the app ships are the home zones (geo.ts HOME_ZONES, barangay + town in the name).
 *  The PSGC tables in the repo list barangay names but carry no coordinates, and public/geo/units.json holds province and city outlines only, so no other barangay can be named yet.
 *  shortcut: two barangays, upgrade by adding rows to BARANGAYS when a coordinate source (PSA or OpenStreetMap extract, with licence) is chosen. */
export interface NamedPlace { barangay: string; town: string }
/** 'Dampas, Tagbilaran City' -> { barangay: 'Dampas', town: 'Tagbilaran' } ('City' dropped: the label reads '<barangay>, <town>'). */
const split = (name: string): NamedPlace => { const [b = '', t = ''] = name.split(',').map((s) => s.trim()); return { barangay: b, town: t.replace(/ City$/, '') } }
const BARANGAYS: readonly (NamedPlace & LatLon)[] = HOME_ZONES.map((z) => ({ ...split(z.name), lat: z.lat, lon: z.lon }))
/** A barangay is a few km across; past this a point is not placed in it. */
export const BARANGAY_KM = 2

/** The barangay a point is in (within BARANGAY_KM of a known centre, the nearest wins), else null. Unknown or non-finite input is null, never a default barangay. */
export function nearestPlace(p: LatLon | null | undefined): NamedPlace | null {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null
  let best: (NamedPlace & { km: number }) | null = null
  for (const b of BARANGAYS) { const km = distanceKm(p, b); if (km <= BARANGAY_KM && (!best || km < best.km)) best = { barangay: b.barangay, town: b.town, km } }
  return best ? { barangay: best.barangay, town: best.town } : null
}
export const placeLabel = (n: NamedPlace): string => `${n.barangay}, ${n.town}`
/** The label of a home zone id ('Dampas, Tagbilaran'); unknown id -> the first zone, as placeWords did. */
export const zoneLabel = (zone: string): string => placeLabel(split((HOME_ZONES.find((z) => z.id === zone) ?? HOME_ZONES[0]).name))
