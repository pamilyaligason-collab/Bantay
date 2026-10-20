import { useMemo } from 'react'
import { usePlace } from '../location/useLocation'
import { placeTimezone } from '../location/place'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { clockIn } from '../weather/forecast'
import { weatherWarning } from '../weather/warning'
import { rainOutlook, rainWords, skyOf, weatherAction, wxLocal } from './heroCards'
import { placeNameOf } from './placeName'
import { useWeather } from './weather'

export const WEATHER_HREF = '#weather'
export const WEATHER_ACTION_HREF = '#weather?from=action' // from=action counts weather_opened_action: only when an action line is on the card
const NONE: Alert[] = []

/** Today's one compact weather card from the cached forecast: temperature, condition, place, the rain window when there is one, and an action line
 *  from the same actionLines() as the Weather screen. Nothing is drawn until a temperature is known (never a made-up 0). */
export default function WeatherCard() {
  const place = usePlace()
  const wx = useWeather(place?.weather ?? null)
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const warn = useMemo(() => (place ? weatherWarning(alerts, place.weather) : null), [alerts, place])
  if (!wx || wx.temp == null || !place) return null
  const now = new Date()
  const sky = skyOf(wx)
  const rain = wx.hourly ? rainOutlook(wx.hourly.time, wx.hourly.prob, wxLocal(wx, now), sky === 'rain' || sky === 'storm') : undefined
  const action = weatherAction(wx, now, warn)
  const clock = clockIn(wx.at, placeTimezone(place.weather, wx.tz))
  const asOf = clock ? `as of ${clock}` : null
  const cond = `${wx.words[0]!.toUpperCase()}${wx.words.slice(1)}`
  return (
    <section aria-label="Weather">
      <a className="card td-wx" href={action ? WEATHER_ACTION_HREF : WEATHER_HREF}>
        <span className="td-wx-t">{Math.round(wx.temp)}°</span>
        <span className="td-grow">
          <b>{cond} · {placeNameOf(place)}</b>
          {rain && <span className="td-sub">{rainWords(rain)}</span>}
          {action && <span className="td-wx-act">{action}</span>}
          {asOf && <span className="td-sub">{asOf}</span>}
        </span>
        <span className="td-link" aria-hidden="true">›</span>
      </a>
    </section>
  )
}
