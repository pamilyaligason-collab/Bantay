import { hoursFrom, type Forecast } from './forecast'

/** R3 (RainViewer free API docs, read 2026-10-27): past frames only, zoom <= 7, coverage shown by a mask; the docs do not confirm the Philippines.
 *  Until someone checks the coverage tiles over Mindanao and Bohol and flips this, the rain card is the Open-Meteo hourly bars plus a PAGASA radar link (M1). No tiles are requested. */
export const RAINVIEWER_PH_CONFIRMED = false
export type RainMode = 'bars' | 'radar'
export const rainMode = (confirmed = RAINVIEWER_PH_CONFIRMED): RainMode => (confirmed ? 'radar' : 'bars')

export const PAGASA_RADAR_HREF = 'https://www.pagasa.dost.gov.ph/'

export interface RainBar { time: string; pct: number | null; level: 'none' | 'light' | 'moderate' | 'heavy' | 'unknown' }
/** Chance of rain, not amount. Unknown stays unknown (never 0%). */
export const rainLevel = (p: number | null): RainBar['level'] => (p == null ? 'unknown' : p < 20 ? 'none' : p < 40 ? 'light' : p < 70 ? 'moderate' : 'heavy')

/** The next `n` hours of rain chance from the cached forecast. */
export function rainBars(fc: Forecast, n = 12, now = Date.now()): RainBar[] {
  return hoursFrom(fc, n, now).map((h) => ({ time: h.time, pct: h.prob, level: rainLevel(h.prob) }))
}
