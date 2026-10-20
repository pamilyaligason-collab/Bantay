import { usePlace } from '../location/useLocation'
import { manilaLocal, rainOutlook, rainWords, skyOf, weatherAction } from './heroCards'
import { placeNameOf } from './placeName'
import { useWeather } from './weather'

export const WEATHER_HREF = '#weather?from=action' // the one Weather screen (lane M4); from=action counts weather_opened_action

/** Today's one compact weather card from the cached forecast: temperature, condition, place, the rain window when there is one, and an action line
 *  for heat or likely rain. Nothing is drawn until a temperature is known (never a made-up 0). */
export default function WeatherCard() {
  const place = usePlace()
  const wx = useWeather(place?.weather ?? null)
  if (!wx || wx.temp == null) return null
  const now = new Date()
  const sky = skyOf(wx)
  const rain = wx.hourly ? rainOutlook(wx.hourly.time, wx.hourly.prob, manilaLocal(now), sky === 'rain' || sky === 'storm') : undefined
  const action = weatherAction(wx)
  const t = new Date(wx.at)
  const asOf = Number.isNaN(t.getTime()) ? null : `as of ${t.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })}`
  const cond = `${wx.words[0]!.toUpperCase()}${wx.words.slice(1)}`
  return (
    <section aria-label="Weather">
      <a className="card td-wx" href={WEATHER_HREF}>
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
