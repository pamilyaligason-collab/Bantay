import { usePlace } from '../location/useLocation'
import { CountUp } from '../look'
import { manilaLocal, rainOutlook, rainWords, skyOf } from './heroCards'
import { placeNameOf } from './placeName'
import { useWeather } from './weather'

/** Compact weather line on a sky gradient. Nothing known yet (no place, offline, no reading): nothing is drawn. */
export default function WeatherStrip() {
  const place = usePlace()
  const wx = useWeather(place?.weather ?? null)
  if (!wx || wx.temp == null) return null
  const rainy = wx.rainPct != null && wx.rainPct >= 60
  const state = rainy ? 'rain' : wx.temp >= 33 ? 'heat' : 'clear'
  const sky = skyOf(wx)
  const out = wx.hourly ? rainOutlook(wx.hourly.time, wx.hourly.prob, manilaLocal(new Date()), sky === 'rain' || sky === 'storm') : undefined
  const line = out ? rainWords(out) : out === null && rainy ? 'No more rain expected for now.' : wx.rainPct == null ? 'No rain chance yet' : rainy ? `Rain likely, ${wx.rainPct}% chance. Bring an umbrella.` : `${wx.rainPct}% chance of rain today`
  return (
    <section className="td-wx" data-state={state} aria-label="Weather" data-reveal>
      <span className="td-wx-t"><CountUp to={Math.round(wx.temp)} />°</span>
      <span className="td-grow">
        <b>{wx.words[0]!.toUpperCase()}{wx.words.slice(1)} in {placeNameOf(place)}</b>
        <span className="td-wx-s">{line}</span>
      </span>
    </section>
  )
}
