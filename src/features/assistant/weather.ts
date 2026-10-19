import type { LatLon } from '../location/geo'
import { manilaLocal, rainOutlook, rainWords } from '../today/heroCards'
import { loadWeather } from '../today/weather'

/** Same Open-Meteo call as the Today hero (one fetcher). Returns one plain sentence. */
export async function weatherSummary(p: LatLon, f: typeof fetch = fetch): Promise<string> {
  const w = await loadWeather(p, f)
  if (w.temp == null) return 'I could not read the weather right now. Check the Today screen.'
  const rain = w.hourly ? rainOutlook(w.hourly.time, w.hourly.prob, manilaLocal(new Date()), /rain|drizzle|thunder|shower/.test(w.words)) : null
  return `${Math.round(w.temp)} degrees C and ${w.words} now.${w.rainPct == null ? '' : ` Chance of rain today: ${w.rainPct}%.`}${rain ? ` ${rainWords(rain)}` : ''}`
}
