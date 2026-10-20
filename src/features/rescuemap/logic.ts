import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { distanceKm, type LatLon } from '../location/geo'
import { type Entry, forZone, hasPoint, withOverrides, type Overrides } from '../safety/entries'

export type Kind = 'evac' | 'health' | 'police' | 'fire'
export const KINDS: { id: Kind; label: string }[] = [
  { id: 'evac', label: 'Evacuation' },
  { id: 'health', label: 'Health' },
  { id: 'police', label: 'Police' },
  { id: 'fire', label: 'Fire' }
]

/** Which chip an entry belongs to; null = not a rescue point (power, water, general hotlines). */
export function kindOf(e: Pick<Entry, 'group' | 'name'>): Kind | null {
  if (/fire|bfp/i.test(e.name)) return 'fire'
  if (/police|pnp/i.test(e.name)) return 'police'
  if (/^evacuation/i.test(e.group)) return 'evac'
  if (/^(health|hospital)/i.test(e.group)) return 'health'
  return null
}

export interface Spot extends Entry { kind: Kind }
export interface Pin extends Spot { lat: number; lon: number; km: number | null }

/** Seed data plus the family's own edits, for one zone, keeping only rescue points. */
export function spotsFor(zone: string, overrides: Overrides, seed: Entry[] = [...(places as Entry[]), ...(hotlines as Entry[])]): Spot[] {
  const out: Spot[] = []
  for (const e of withOverrides(forZone(seed, zone), overrides)) {
    const kind = kindOf(e)
    if (kind) out.push({ ...e, kind })
  }
  return out
}

/** Pinned spots (have coordinates) in the chosen kinds, nearest first; the rest are listed unpinned. Unknown distance is null. */
export function splitSpots(spots: Spot[], kinds: ReadonlySet<Kind>, me: LatLon | null): { pins: Pin[]; unpinned: Spot[] } {
  const pins: Pin[] = []
  const unpinned: Spot[] = []
  for (const s of spots) {
    if (!kinds.has(s.kind)) continue
    if (hasPoint(s)) pins.push({ ...s, lat: s.lat, lon: s.lon, km: me ? distanceKm(me, s) : null })
    else unpinned.push(s)
  }
  pins.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
  return { pins, unpinned }
}

export const kmLabel = (km: number | null) => (km === null || !Number.isFinite(km) ? 'Distance unknown' : km < 1 ? `${Math.round(km * 100) * 10} m away` : `${km.toFixed(1)} km away`)

/** Google Maps turn-by-turn by car (D-68). */
export const driveUrl = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`
