import type { WxUnits } from '../weather/units'

// S30 L9 (B3): body temperature is typed in the unit the phone uses (US: Fahrenheit) and always stored in Celsius, as before.
// The plausible range is the same for both units: 30 to 45 C is 86 to 113 F (health/plausible.ts temperature).
export type TempUnit = 'C' | 'F'
export const TEMP_RANGE: Record<TempUnit, readonly [number, number]> = { C: [30, 45], F: [86, 113] }
/** Fahrenheit for a US weather-units phone (the one units setting, weather/units.ts), Celsius otherwise. */
export const tempUnitFor = (u: WxUnits): TempUnit => (u === 'us' ? 'F' : 'C')

const round1 = (n: number) => Math.round(n * 10) / 10
export const cToF = (c: number): number => round1((c * 9) / 5 + 32)
export const fToC = (f: number): number => round1(((f - 32) * 5) / 9)

/** What the person typed, in `unit`: the Celsius value to store (a Celsius entry stays exactly as typed; a Fahrenheit one is converted to one decimal)
 *  and the Fahrenheit twin to show. null when it is empty, not a number, or outside that unit's range. */
export function parseTemp(text: string, unit: TempUnit): { c: number; f: number } | null {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  const [lo, hi] = TEMP_RANGE[unit]
  if (!Number.isFinite(n) || n < lo || n > hi) return null
  return unit === 'C' ? { c: n, f: cToF(n) } : { c: fToC(n), f: n }
}

export const tempAsk = (unit: TempUnit): string => `Type the temperature in °${unit}, a number from ${TEMP_RANGE[unit][0]} to ${TEMP_RANGE[unit][1]}.`
/** "37.5 °C (99.5 °F)": both units on the saved line. */
export const tempBoth = (t: { c: number; f: number }): string => `${t.c} °C (${t.f} °F)`
