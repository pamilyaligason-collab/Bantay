import { useSyncExternalStore } from 'react'
import { HOME_ZONES, distanceKm, type LatLon } from './geo'
import { nearestBarangay } from './barangayPacks'

/** S28: the exact place, offline. Home zones keep their owner-chosen names (geo.ts HOME_ZONES); anywhere else a good GPS fix is named from the
 *  OpenStreetMap barangay packs (D-181, barangayPacks.ts), looked up once per fix below. No network geocoder. */
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
export const nearestLabel = (n: NamedPlace): string => (n.town ? `${n.barangay}, ${n.town}` : n.barangay) // name only when the town is empty
/** The label of a home zone id ('Dampas, Tagbilaran'); unknown id -> the first zone, as placeWords did. */
export const zoneLabel = (zone: string): string => nearestLabel(split((HOME_ZONES.find((z) => z.id === zone) ?? HOME_ZONES[0]).name))

/* ---- Offline pack lookup (D-181), resolved once per fix ----
 * placeWords stays synchronous: it reads this cache and starts the lookup the first time a good fix is seen. The zone/area wording is the answer until the lookup resolves,
 * and stays the answer when it finds nothing (offline and not cached, or no point within range). */
const KEY_DP = 3 // about 110 m: one fix is one lookup, a still phone never repeats it
const RETRY_MS = 10 * 60_000 // a miss (offline, nothing near) is asked again after this, never in a loop
const found = new Map<string, { at: number; place: NamedPlace | null }>()
const inFlight = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
const keyOf = (p: LatLon) => `${p.lat.toFixed(KEY_DP)},${p.lon.toFixed(KEY_DP)}`
// Town names stay as OSM writes them: 'Quezon City' is not the province 'Quezon' (Opus S28).
const clean = (town: string) => town.replace(/\bCIty\b/, 'City')

/** The pack answer for a point if it is known: a place, null (looked, nothing), or undefined (not looked yet / still looking). Starts the lookup when it is not known. */
export function packPlace(p: LatLon | null | undefined, now: number = Date.now()): NamedPlace | null | undefined {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return undefined
  const k = keyOf(p)
  const hit = found.get(k)
  if (hit && (hit.place || now - hit.at < RETRY_MS)) return hit.place
  if (!inFlight.has(k)) {
    inFlight.add(k)
    nearestBarangay(p.lat, p.lon).then((r) => r && { barangay: r.name, town: clean(r.town) }, () => null).then((place) => {
      inFlight.delete(k)
      const changed = found.get(k)?.place?.barangay !== place?.barangay || found.get(k)?.place?.town !== place?.town
      if (found.size > 500) found.clear() // shortcut: bounded per-session cache, a long drive just re-looks up
      found.set(k, { at: now, place })
      if (changed && place) { version++; listeners.forEach((l) => l()) }
    })
  }
  return hit ? hit.place : undefined
}
/** useSyncExternalStore pair: a component that shows placeWords re-renders when a lookup lands. */
export const subscribePacks = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l) }
export const packVersion = () => version
export const useBarangayTick = (): number => useSyncExternalStore(subscribePacks, packVersion, packVersion)
/** Test hook: forget every lookup. */
export const _resetPackPlaces = () => { found.clear(); inFlight.clear(); version = 0 }
