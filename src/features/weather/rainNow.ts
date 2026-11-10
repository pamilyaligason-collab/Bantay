import type { RainingNow } from '../../../supabase/functions/weather-blend/blend'
import { zoneLabel } from '../location/nearestPlace'

/** A rain chance in words: under 10% is "Low chance", never "0%" (a chance is not a promise of dry). null stays null. */
export const rainChanceText = (pct: number | null | undefined): string | null => (pct == null ? null : pct < 10 ? 'Low chance' : `${Math.round(pct)}%`)

/** The chip's two lines: "Raining now" and where that comes from. null unless it is raining (a dry or unknown reading shows nothing). */
export function rainNowChip(r: RainingNow | null | undefined): { title: string; source: string } | null {
  if (!r?.value) return null
  return { title: 'Raining now', source: r.source === 'observed' ? `observed at ${r.station ?? 'a nearby airport'}` : 'model' }
}

/** "Location off: showing <place>" when no fix was found and no zone was picked by hand (the home zone is only the fallback); else null. */
export function locationOffNote(place: { source: string; zone: string; picked?: boolean; settled?: boolean } | null): string | null {
  return place && place.settled !== false && place.source === 'zone' && place.picked === false ? `Location off: showing ${zoneLabel(place.zone)}` : null
}
