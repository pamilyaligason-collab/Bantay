import type { LatLon } from '../location/geo'
import { placeTimezone } from '../location/place'
import { clockIn } from '../weather/forecast'
import { rainOutlook, rainWords, wxLocal } from '../today/heroCards'
import { loadWeather } from '../today/weather'

/** Same Open-Meteo call as the Today hero (one fetcher). Returns one plain sentence. A cached (offline) forecast says "as of HH:MM", never "now". */
export async function weatherSummary(p: LatLon, f: typeof fetch = fetch): Promise<string> {
  const w = await loadWeather(p, f)
  if (w.temp == null) return 'I could not read the weather right now. Check the Today screen.'
  const rain = w.hourly ? rainOutlook(w.hourly.time, w.hourly.prob, wxLocal(w, new Date()), /rain|drizzle|thunder|shower/.test(w.words)) : null
  const when = w.offline ? ` as of ${clockIn(w.at, placeTimezone(p, w.tz))}` : ' now'
  return `${Math.round(w.temp)} degrees C and ${w.words}${when}.${w.rainPct == null ? '' : ` Chance of rain today: ${w.rainPct}%.`}${rain ? ` ${rainWords(rain)}` : ''}`
}
