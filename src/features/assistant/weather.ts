import type { LatLon } from '../location/geo'

const CODE: [number, string][] = [[0, 'clear'], [3, 'partly cloudy'], [48, 'foggy'], [57, 'drizzle'], [67, 'rainy'], [77, 'snowy'], [82, 'rain showers'], [86, 'snow showers'], [99, 'thunderstorms']]
const words = (c: number) => CODE.find(([max]) => c <= max)?.[1] ?? 'unsettled'

/** Open-Meteo, client side, no key. Returns one plain sentence. */
export async function weatherSummary(p: LatLon, f: typeof fetch = fetch): Promise<string> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code&daily=precipitation_probability_max&timezone=Asia%2FManila&forecast_days=1`
  const res = await f(u)
  if (!res.ok) throw new Error(String(res.status))
  const j = (await res.json()) as { current: { temperature_2m: number; weather_code: number }; daily?: { precipitation_probability_max?: number[] } }
  const rain = j.daily?.precipitation_probability_max?.[0]
  return `${Math.round(j.current.temperature_2m)} degrees C and ${words(j.current.weather_code)} now.${rain == null ? '' : ` Chance of rain today: ${rain}%.`}`
}
