// Heat index from air temperature and relative humidity (NWS: Steadman simple formula, Rothfusz regression, and the two
// standard adjustments), then the PAGASA bands. Pure; no clock, no network.

const toF = (c: number) => (c * 9) / 5 + 32
const toC = (f: number) => ((f - 32) * 5) / 9

/** Heat index in degrees F. Valid for shade, light wind. Below 80 F the simple formula is used, as the NWS does. */
export function heatIndexF(t: number, rh: number): number {
  const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094)
  if ((simple + t) / 2 < 80) return simple
  let hi =
    -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh +
    0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
  if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17)
  else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5)
  return hi
}

/** Heat index in degrees C from air temperature in C and humidity in percent. null when either is unknown (never a made-up 0). */
export function heatIndexC(tempC: number | null | undefined, rh: number | null | undefined): number | null {
  if (tempC == null || rh == null || !Number.isFinite(tempC) || !Number.isFinite(rh)) return null
  return toC(heatIndexF(toF(tempC), Math.min(100, Math.max(0, rh))))
}

export interface HeatBand { id: 'caution' | 'extreme-caution' | 'danger' | 'extreme-danger'; label: string; min: number; max: number; action: string; level: 1 | 2 | 3 | 4 }

/** PAGASA heat index bands, whole degrees C.
 *  TO CONFIRM on pagasa.dost.gov.ph before release (record URL and date in docs/SOURCES.md). Values below are the ones in
 *  docs/session-6/PART-3.md section 3.2; the action lines are Bantay's own plain words. */
export const HEAT_BANDS: readonly HeatBand[] = [
  { id: 'caution', label: 'Caution', min: 27, max: 32, level: 1, action: 'Drink water often.' },
  { id: 'extreme-caution', label: 'Extreme caution', min: 33, max: 41, level: 2, action: 'Avoid the noon sun. Drink water often.' },
  { id: 'danger', label: 'Danger', min: 42, max: 51, level: 3, action: 'Stay indoors 11 AM-3 PM. Drink water often. Check on older family.' },
  { id: 'extreme-danger', label: 'Extreme danger', min: 52, max: Infinity, level: 4, action: 'Stay indoors and keep cool. Call 911 if someone is confused or faint.' }
]

/** The band for a heat index in C (rounded to a whole degree), or null below 27. */
export function heatBand(hiC: number | null | undefined): HeatBand | null {
  if (hiC == null || !Number.isFinite(hiC)) return null
  const r = Math.round(hiC)
  return [...HEAT_BANDS].reverse().find((b) => r >= b.min) ?? null
}
