import type { RainingNow } from '../../../supabase/functions/weather-blend/blend'
import { condOf } from './scene'

/** A rain chance in words: under 10% is "Low chance", never "0%" (a chance is not a promise of dry). null stays null. */
export const rainChanceText = (pct: number | null | undefined): string | null => (pct == null ? null : pct < 10 ? 'Low chance' : `${Math.round(pct)}%`)

/** The chip's two lines: "Raining now" and where that comes from. null unless it is raining (a dry or unknown reading shows nothing). */
export function rainNowChip(r: RainingNow | null | undefined): { title: string; source: string } | null {
  if (!r?.value) return null
  return { title: 'Raining now', source: r.source === 'observed' ? `observed at ${r.station ?? 'a nearby airport'}` : 'model' }
}

const isWetCode = (c: number | null | undefined) => c != null && ((c >= 51 && c <= 67) || c >= 80)

/** One story for the Today card. Raining now (airport or model): the words say rain, the icon is the rain icon, the strong-sun tip is hidden.
 *  An airport report of dry beats a rain code from the model: no rain words or icon then. Anything else is left as the forecast has it. */
export function reconcileNow(w: { words: string; code?: number | null; precip?: number | null; rainingNow?: RainingNow | null }): { words: string; code: number | null; hideSun: boolean } {
  const code = w.code ?? null
  const r = w.rainingNow
  const light = w.precip != null && w.precip < 2.5
  if (r?.value) return { words: isWetCode(code) ? w.words : light ? 'light rain' : 'rain', code: isWetCode(code) ? code : light ? 61 : 63, hideSun: true }
  if (r && r.source === 'observed' && isWetCode(code)) return { words: 'cloudy', code: 3, hideSun: false }
  return { words: w.words, code, hideSun: false }
}

/** The one rule for "it is raining now", shared by Today, Simple mode and Weather (ML-51): the reconciled code (an airport or model report wins over a dry-looking code) is drizzle, rain or storm. */
export function isRainingNow(w: { code?: number | null; precip?: number | null; rainingNow?: RainingNow | null }): boolean {
  const c = condOf(reconcileNow({ words: '', code: w.code, precip: w.precip, rainingNow: w.rainingNow }).code)
  return c === 'drizzle' || c === 'rain' || c === 'storm'
}

/** "Location off: showing your home area" (the place itself is the header pill's, so it is not said twice) when no fix was found and no zone was picked by hand (the home zone is only the fallback); else null. */
export function locationOffNote(place: { source: string; zone: string; picked?: boolean; settled?: boolean } | null): string | null {
  if (place?.settled === false) return null
  if (place?.source === 'home') return 'Location off: showing your home place' // S30 L9: the member's own saved place stands in for the zone
  return place && place.source === 'zone' && place.picked === false ? 'Location off: showing your home area' : null
}
