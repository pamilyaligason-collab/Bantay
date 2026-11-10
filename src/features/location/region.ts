import { useEffect, useState } from 'react'
import { db } from '../../db'
import { HOTLINE_AREAS, type LatLon } from './geo'
import { inPhilippines } from './place'
import { phoneCountry } from './phoneRegion'
import { usePlace } from './useLocation'

export { phoneCountry, phoneAbroad, toE164 } from './phoneRegion'

// S30 L8 (Texas): which country the phone's owner is in right now. 'ph' = Philippines, 'us' = United States (the Texas box and a US phone), null = unknown.
// Used by the self-harm card (988 vs 1553), the PH-only cards, tel:/sms: of PH numbers and the default weather units. Unknown never means "Philippines" for a
// life-safety line (it shows both) and never means "abroad" for a phone number (a number is left as typed).
export type Region = 'ph' | 'us' | null

const TEXAS = HOTLINE_AREAS.find((a) => a.id === 'texas' && a.kind === 'box')
export const inTexas = (p: LatLon): boolean => !!TEXAS && TEXAS.kind === 'box' && p.lat >= TEXAS.south && p.lat <= TEXAS.north && p.lon >= TEXAS.west && p.lon <= TEXAS.east

/** A known position decides first (the Philippines box, the Texas box); a position elsewhere, or none, falls to the phone's country. */
export function regionOf(p: LatLon | null | undefined, country: 'PH' | 'US' | null = phoneCountry()): Region {
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    if (inPhilippines(p)) return 'ph'
    if (inTexas(p)) return 'us'
  }
  return country === 'PH' ? 'ph' : country === 'US' ? 'us' : null
}

/** Where the phone is, for safety lines: the last real fix this phone stored (kv loc.last) and the phone's own country must agree; when they disagree (an old fix, a trip, a phone set to
 *  another country) the answer is null = unknown, and the crisis card then shows both lines. Never prompts, never throws, never waits more than half a second for the database. */
export async function viewerRegion(): Promise<Region> {
  try {
    const read = db.kv.get('loc.last').then((r) => r?.value as { lat?: number; lon?: number } | undefined, () => undefined)
    const v = await Promise.race([read, new Promise<undefined>((ok) => setTimeout(() => ok(undefined), 500))])
    const p = v && typeof v.lat === 'number' && typeof v.lon === 'number' ? { lat: v.lat, lon: v.lon } : null
    return agree(p ? regionOf(p, null) : null, regionOf(null))
  } catch { return regionOf(null) }
}
/** The fix and the phone's country must agree; when both say something and differ (an old fix, a trip), nothing is known. */
const agree = (byFix: Region, byPhone: Region): Region => (byFix && byPhone && byFix !== byPhone ? null : byFix ?? byPhone)

/** Where the phone's owner is, from a place (usePlace): a real fix (the phone's own position, not the saved home) decides, and it must agree with the phone's country. */
export function placeRegion(place: { source?: string; weather?: LatLon } | null | undefined): Region {
  const fix = place && (place.source === 'gps' || place.source === 'last' || place.source === 'gps-abroad') && place.weather ? place.weather : null
  return agree(fix ? regionOf(fix, null) : null, regionOf(null))
}
/** For the screens that are Philippine-only (Climate, Plant, DA prices, Lotto, the PH bulletin labels): 'us' means hide them and label the Philippine alerts; ph or unknown changes nothing. */
export const usePlaceRegion = (): Region => placeRegion(usePlace())

/** The phone's own region for rendering: the phone's country at first paint, the stored fix once read. */
export function useViewerRegion(): Region {
  const [r, setR] = useState<Region>(() => regionOf(null))
  useEffect(() => { let live = true; void viewerRegion().then((x) => { if (live) setR(x) }); return () => { live = false } }, [])
  return r
}

