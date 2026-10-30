import type { CSSProperties } from 'react'
import { TEXT_VEIL } from './wxVeil'
import { usePlace } from '../location/useLocation'
import { placeTimezone } from '../location/place'
import { Icon } from '../shell/Icon'
import { JackArt, SceneHero, type JackName } from '../look'
import { clockIn, kindOf } from '../weather/forecast'
import { condOf, feelsLike, isHot, todOf } from '../weather/scene'
import WeatherScene from '../weather/WeatherScene'
import { rainOutlook, skyOf, weatherActionLine, wxLocal, type Wx } from './heroCards'
import { MedsCheck } from './NextUp'
import { placeNameOf } from './placeName'

import { useWeather } from './weather'

export const WEATHER_HREF = '#weather'
export const WEATHER_ACTION_HREF = '#weather?from=action' // from=action counts weather_opened_action: only when an action line is on the card
const VEIL = { '--wx-veil': TEXT_VEIL } as CSSProperties

const hour12 = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`

/** W-2: the one plain rain sentence on the weather hero ("Sunny till 3 PM, then rain. Bring an umbrella."), worked out at render time from the hourly forecast.
 *  null when no rain is coming today (the hero then shows the heat or sun action line, or nothing). Never guesses without hourly data. */
function rainSummary(wx: Wx, now: Date): string | null {
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

/** N-2: say when the weather is for the saved zone because the phone did not share its position (not while it is still looking). */
const whereOf = (place: Parameters<typeof placeNameOf>[0]) => (place?.source === 'zone' && place.settled ? `${placeNameOf(place)} (saved zone)` : placeNameOf(place))

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
        <span className="td-grow"><b>{wx.words[0]!.toUpperCase()}{wx.words.slice(1)} · {whereOf(place)}</b>{rain && <span className="td-sub">{rain}</span>}</span>
        <span className="td-link"><Icon name="chev" size={20} /></span>
      </span>
    </a>
  )
}

/** "may be out of date" when the forecast is the last good one from the cache (frame today-offline). */
const offlineNote = (wx: Wx) => (wx.offline ? ', may be out of date' : '')

/** Today's one weather card (S16 L1, R1): a Scene hero on the shipped WeatherScene. Expanded (232 px) when nothing else needs the top of the screen, compact (196 px) when Next up,
 *  the alerts-off card or a warning is on screen. Kicker "General Santos · as of 9:00", the temperature in serif (56 px, 44 compact) with the condition beside it, the plain rain or heat line,
 *  the feels-like pill, then (expanded) the action box with Jack and a 3-slot hourly strip. The whole card links to the Weather screen.
 *  A PAGASA warning never shows here (N-8, it has its own card); `storm` draws the night storm scene with no Jack (R11); `noJack` drops Jack when another is on screen (D-91).
 *  Nothing is drawn until a temperature is known (never a made-up 0). */
export default function WeatherCard({ expanded = false, review = 0, noJack = false, storm = false }: { expanded?: boolean; review?: number; noJack?: boolean; storm?: boolean }) {
  const place = usePlace()
  const wx = useWeather(place?.weather ?? null)
  if (!wx || wx.temp == null || !place) return null
  const now = new Date()
  const line = storm ? null : weatherActionLine(wx, now, null)
  const text = storm ? 'Rain and strong wind.' : line?.id === 'rain' ? rainSummary(wx, now) ?? line.text : line?.text ?? null
  // Jack only on an everyday rain or heat tip, in the expanded card. Never on a storm, an air alert or the Danger heat bands and above (rank 80+, D-91), and never when `noJack`.
  const jack: JackName | null = noJack || storm || !expanded ? null : line?.id === 'rain' ? 'ready-for-rain' : line?.id === 'heat' && line.rank < 80 ? 'drink-water' : null
  const href = line ? WEATHER_ACTION_HREF : WEATHER_HREF
  const cond = storm ? 'Thunderstorm' : `${wx.words[0]!.toUpperCase()}${wx.words.slice(1)}`
  // The same single "Feels like" and danger label as the Weather screen (scene.ts feelsLike): heat index when it applies, else the forecast's apparent temperature.
  const fl = feelsLike(wx.temp, wx.humidity, wx.feels)
  const feelsOn = fl.value != null && Math.round(fl.value) > Math.round(wx.temp)
  const feels = storm ? (fl.value != null ? `Feels ${deg(fl.value)}` : null) : feelsOn ? [`Feels ${deg(fl.value!)}`, fl.label].filter(Boolean).join(' · ') : null
  const drink = !storm && !!fl.label // N5: "Drink water" from Extreme caution up
  const clock = clockIn(wx.at, placeTimezone(place.weather, wx.tz))
  const scene = <WeatherScene tod={storm ? 'night' : todOf(wxLocal(wx, now), wx.sunrise, wx.sunset)} cond={storm ? 'storm' : condOf(wx.code)} hot={!storm && isHot(wx.temp, wx.humidity)} />
  const next = slots(wx, now) // both sizes: 56 px expanded, 40 px compact (PLAN 1.1 row 2)
  const kicker = `${whereOf(place)}${clock ? ` · as of ${clock}` : ''}${offlineNote(wx)}`
  const range = expanded && !storm ? [wx.high != null && `High ${deg(wx.high)}`, wx.low != null && `Low ${deg(wx.low)}`].filter(Boolean).join(' · ') : '' // live parity: today's range (V11 section B)
  const pills = (feels || drink) && (
    <span className="td-wxh-pills">{feels && <span className="td-wxh-pill">{feels}</span>}{drink && <span className="td-wxh-pill">Drink water</span>}</span>
  )
  const box = expanded && text && (
    <span className="td-act-box"><Icon name="therm" size={24} /><b>{text}</b>{jack && <JackArt name={jack} size={56} decorative className="td-wx-jack" />}</span>
  )
  return (
    <section aria-label="Weather" className="td-wxs" data-size={expanded ? 'expanded' : 'compact'} data-testid="weather-hero" style={VEIL}>
      <SceneHero
        scene={scene}
        inkOnScene
        compact={!expanded}
        kicker={kicker}
        title={<span className="td-wxh-top"><span className="td-wxh-t">{deg(wx.temp)}</span><span className="td-wxh-c">{cond}</span>{range && <span className="td-wxh-hl">{range}</span>}</span>}
        body={(
          <>
            {!expanded && text && <span className="td-wxh-line">{text}</span>}
            {pills}
            {box}
            {next.length > 0 && (
              <ul className="td-wxh-hrs" aria-label="Next hours">
                {next.map((s) => <li key={s.time}><span>{s.time}</span><Icon name={s.kind} size={24} />{s.pct != null && <span>{Math.round(s.pct)}%<span className="td-vh"> chance of rain</span></span>}</li>)}
              </ul>
            )}
          </>
        )}
      >
        <a className="td-wx-cover" href={href} aria-label={`Weather in ${placeNameOf(place)}, ${deg(wx.temp)}, ${cond}. Open the weather.`} />
        <span className="td-wx-chev" aria-hidden="true"><Icon name="chev" size={24} /></span>
      </SceneHero>
      {expanded && review > 0 && <MedsCheck review={review} quiet />}
    </section>
  )
}
