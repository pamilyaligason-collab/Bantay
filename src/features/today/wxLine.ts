import { rainOutlook, skyOf, wxLocal, type Wx } from './heroCards'
import { todOf } from '../weather/scene'

const hour12 = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`

/** W-2: the one plain rain sentence on the weather hero ("Sunny till 3 PM, then rain. Bring an umbrella."), worked out at render time from the hourly forecast.
 *  null when no rain is coming today (the hero then shows the heat or sun action line, or nothing). Never guesses without hourly data. */
export function rainSummary(wx: Wx, now: Date): string | null {
  if (!wx.hourly) return null
  const sky = skyOf(wx)
  const nowLocal = wxLocal(wx, now)
  const raining = sky === 'rain' || sky === 'storm'
  const out = rainOutlook(wx.hourly.time, wx.hourly.prob, nowLocal, raining)
  if (!out || out.tomorrow) return null
  if (out.now) return out.endH < 0 ? 'Rain likely to last. Bring an umbrella.' : `Rain until ${hour12(out.endH)}. Bring an umbrella.`
  const night = todOf(nowLocal, wx.sunrise, wx.sunset) === 'night'
  const dry = sky === 'clear' ? (night ? 'Clear' : 'Sunny') : sky === 'cloud' ? 'Cloudy' : sky === 'fog' ? 'Foggy' : 'Dry'
  return `${dry} till ${hour12(out.startH)}, then rain. Bring an umbrella.`
}
