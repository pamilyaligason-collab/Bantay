import { phoneCountry } from '../location/phoneRegion'
import { useKv } from '../shell/useKv'

// S30 L8 (B2): display units follow the phone's country (US: °F and mph, Philippines: °C and km/h) and can be changed in Settings > Display.
// The data stays metric (the heat, rain and wind thresholds are metric); only what is drawn is converted.
export type WxUnits = 'metric' | 'us'
export const WX_UNITS_KEY = 'wx.units'
export const WX_UNIT_OPTIONS: { id: WxUnits; label: string }[] = [{ id: 'metric', label: 'Celsius and km/h' }, { id: 'us', label: 'Fahrenheit and mph' }]
export const isWxUnits = (v: unknown): v is WxUnits => v === 'metric' || v === 'us'
/** The default for a phone: US phones get Fahrenheit and mph, every other phone Celsius and km/h. */
export const defaultWxUnits = (country = phoneCountry()): WxUnits => (country === 'US' ? 'us' : 'metric')

/** The units to draw in: the saved choice, else the phone's default. Metric is the first paint until the saved choice is read. */
export function useWxUnits(): WxUnits {
  const [saved] = useKv<unknown>(WX_UNITS_KEY, null)
  return isWxUnits(saved) ? saved : defaultWxUnits()
}

/** "86°F" in US units, "30°" in metric (as before), or "n/a" for no value. */
export function tempText(c: number | null | undefined, u: WxUnits): string {
  if (c == null || !Number.isFinite(c)) return 'n/a'
  return u === 'us' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°`
}
/** Wind from km/h: "9 km/h" or "6 mph" (1 mph = 1.609344 km/h). */
export function windText(kmh: number | null | undefined, u: WxUnits): string {
  if (kmh == null || !Number.isFinite(kmh)) return 'n/a'
  return u === 'us' ? `${Math.round(kmh / 1.609344)} mph` : `${Math.round(kmh)} km/h`
}
