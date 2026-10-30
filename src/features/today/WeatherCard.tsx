import { useMemo, type CSSProperties } from 'react'
import { TEXT_VEIL } from './wxVeil'
import { usePlace } from '../location/useLocation'
import { placeTimezone } from '../location/place'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { Icon } from '../shell/Icon'
import { JackArt, type JackName } from '../look'
import { clockIn, kindOf } from '../weather/forecast'
import { condOf, feelsLike, isHot, todOf } from '../weather/scene'
import WeatherScene from '../weather/WeatherScene'
import { weatherWarning } from '../weather/warning'
import { rainOutlook, rainWords, skyOf, weatherActionLine, wxLocal, type Wx } from './heroCards'
import { MedsCheck } from './NextUp'
import { placeNameOf } from './placeName'

import { useWeather } from './weather'

/** N-2: say when the weather is for the saved zone because the phone did not share its position (not while it is still looking). */
const whereOf = (place: Parameters<typeof placeNameOf>[0]) => (place?.source === 'zone' && place.settled ? `${placeNameOf(place)} (saved zone)` : placeNameOf(place))

export const WEATHER_HREF = '#weather'
export const WEATHER_ACTION_HREF = '#weather?from=action' // from=action counts weather_opened_action: only when an action line is on the card
const NONE: Alert[] = []
const VEIL = { '--wx-veil': TEXT_VEIL } as CSSProperties

const deg = (n: number) => `${Math.round(n)}°`
const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }

/** The next three 3-hour slots from the current place-local hour: time, sky icon, rain chance. Empty without hourly data. */
function slots(wx: Wx, now: Date) {
  const h = wx.hourly
  if (!h) return []
  const at = wxLocal(wx, now).slice(0, 13)
  const from = h.time.findIndex((t) => t.slice(0, 13) >= at)
  if (from < 0) return []
  return [0, 3, 6].map((k) => from + k).filter((i) => i < h.time.length).map((i) => ({ time: hourLabel(h.time[i]!), kind: kindOf(h.code?.[i] ?? null), pct: h.prob[i] }))
}

/** Simple mode's one weather line: temperature, words and today's rain chance. Nothing until a temperature is known (never a made-up 0). */
export function WeatherStrip() {
  const place = usePlace()
  const wx = useWeather(place?.weather ?? null)
  if (!wx || wx.temp == null || !place) return null
  const rain = wx.rainPct == null ? null : `Rain chance ${Math.round(wx.rainPct)}%`
  return (
    <a className="card td-wx" href={WEATHER_HREF} aria-label="Weather">
      <span className="td-wx-row">
        <span className="td-wx-t">{deg(wx.temp)}</span>
        <span className="td-grow"><b>{wx.words[0]!.toUpperCase()}{wx.words.slice(1)} · {placeNameOf(place)}</b>{rain && <span className="td-sub">{rain}</span>}</span>
        <span className="td-link"><Icon name="chev" size={20} /></span>
      </span>
    </a>
  )
}

/** Today's one weather card from the cached forecast. Compact: one row (temperature, condition and place, feels like, rain line) with the action line in an amber box below.
 *  `noJack` drops the tip's Jack when the screen already shows one (Simple mode at night). `expanded` (Today has no Next up item) is the dark green hero from the Weather screen filling that slot: big temperature, sky icon, range, the action box, the next three
 *  slots, and a quiet medicines row when `review` > 0. Nothing is drawn until a temperature is known (never a made-up 0). */
export default function WeatherCard({ expanded = false, review = 0, noJack = false }: { expanded?: boolean; review?: number; noJack?: boolean }) {
  const place = usePlace()
  const wx = useWeather(place?.weather ?? null)
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const warn = useMemo(() => (place ? weatherWarning(alerts, place.weather) : null), [alerts, place])
  if (!wx || wx.temp == null || !place) return null
  const now = new Date()
  const sky = skyOf(wx)
  const line = weatherActionLine(wx, now, warn)
  const action = line?.text ?? null
  // Jack only on an everyday rain or heat tip. Never on a PAGASA warning, an air alert or the Danger heat bands and above (rank 80+, D-91), and never when `noJack` (another Jack is on the screen).
  const jack: JackName | null = noJack ? null : line?.id === 'rain' ? 'ready-for-rain' : line?.id === 'heat' && line.rank < 80 ? 'drink-water' : null
  const href = action ? WEATHER_ACTION_HREF : WEATHER_HREF
  const cond = `${wx.words[0]!.toUpperCase()}${wx.words.slice(1)}`
  // The same single "Feels like" and danger label as the Weather screen (scene.ts feelsLike): heat index when it applies, else the forecast's apparent temperature.
  const fl = feelsLike(wx.temp, wx.humidity, wx.feels)
  const feels = fl.value != null && Math.round(fl.value) > Math.round(wx.temp) ? [`Feels like ${deg(fl.value)}`, fl.label].filter(Boolean).join(' · ') : null
  const scene = <WeatherScene tod={todOf(wxLocal(wx, now), wx.sunrise, wx.sunset)} cond={condOf(wx.code)} hot={isHot(wx.temp, wx.humidity)} />
  const box = action && <span className="td-act-box"><Icon name="therm" size={22} /><b>{action}</b>{jack && <JackArt name={jack} size={56} decorative className="td-wx-jack" />}</span>

  if (expanded) {
    const clock = clockIn(wx.at, placeTimezone(place.weather, wx.tz))
    const next = slots(wx, now)
    const range = [feels, wx.high != null && `High ${deg(wx.high)}`, wx.low != null && `Low ${deg(wx.low)}`].filter(Boolean).join(' · ')
    return (
      <section aria-label="Weather" className="td-wxs">
        <a className="td-wxh wxs-host" href={href} style={VEIL}>
          {scene}
          <div className="wxs-tx">
          <span className="td-k">Weather · {whereOf(place)}{clock && ` · as of ${clock}`}</span>
          <span className="td-wxh-top"><span className="td-wxh-t">{deg(wx.temp)}</span></span>
          <b className="td-wxh-c">{cond}</b>
          {range && <span className="td-wxh-s">{range}</span>}
          {box}
          {next.length > 0 && (
            <ul className="td-wxh-hrs" aria-label="Next hours">
              {next.map((s) => <li key={s.time}><span>{s.time}</span><Icon name={s.kind} size={22} /><span>{s.pct == null ? '–' : `${Math.round(s.pct)}%`}<span className="td-vh"> chance of rain</span></span></li>)}
            </ul>
          )}
          </div>
        </a>
        {review > 0 && <MedsCheck review={review} quiet />}
      </section>
    )
  }

  const rain = wx.hourly ? rainOutlook(wx.hourly.time, wx.hourly.prob, wxLocal(wx, now), sky === 'rain' || sky === 'storm') : undefined
  return (
    <section aria-label="Weather">
      <a className="card td-wx wxs-host" href={href} style={VEIL}>
        {scene}
        <span className="td-wx-row">
          <span className="td-wx-t">{deg(wx.temp)}</span>
          <span className="td-grow">
            <b>{cond} · {whereOf(place)}</b>
            {feels && <span className="td-sub">{feels}</span>}
            {rain && <span className="td-sub">{rainWords(rain)}</span>}
          </span>
          <span className="td-link"><Icon name="chev" size={20} /></span>
        </span>
        {box}
      </a>
    </section>
  )
}
