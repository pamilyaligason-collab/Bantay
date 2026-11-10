import type { CSSProperties } from 'react'
import { TEXT_VEIL } from './wxVeil'
import { useWeatherPlace } from '../weather/weatherPlace'
import { placeTimezone } from '../location/place'
import { Icon } from '../shell/Icon'
import { JackArt, SceneHero, type JackName } from '../look'
import { clockIn, kindOf } from '../weather/forecast'
import { condOf, feelsLike, isHot, pastSunset, todOf } from '../weather/scene'
import WeatherScene from '../weather/WeatherScene'
import { rainOutlook, skyOf, weatherActionLine, wxLocal, type Wx } from './heroCards'
import { MedsCheck } from './NextUp'
import { placeLineOf, placeNameOf } from './placeName'
import { noBreak } from './timeWords'
import { heroRainLine } from './heroRain'
import { stormSlots, type Slot } from './stormView'
import HourlyStrip, { hourlySlots } from './HourlyStrip'
import { ForecastNote } from '../weather/ForecastNote'
import RainNowChip from '../weather/RainNowChip'
import { locationOffNote, reconcileNow } from '../weather/rainNow'
import { zoneLabel } from '../location/nearestPlace'
import RainMini, { miniSlots } from './RainMini'
import './weatherHero.css'

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
  const raining = sky === 'rain' || sky === 'storm' || wx.rainingNow?.value === true // an airport report of rain beats a dry-looking code
  const out = rainOutlook(wx.hourly.time, wx.hourly.prob, nowLocal, raining)
  if (!out || out.tomorrow) return null
  if (out.now) return out.endH < 0 ? 'Rain likely to last. Bring an umbrella.' : `Rain until ${hour12(out.endH)}. Bring an umbrella.`
  if (raining) return `More rain likely from ${hour12(out.startH)}. Bring an umbrella.` // it is raining now (chip): never "Dry till"
  const night = todOf(nowLocal, wx.sunrise, wx.sunset) === 'night'
  const dry = sky === 'clear' ? (night ? 'Clear' : 'Sunny') : sky === 'cloud' ? 'Cloudy' : sky === 'fog' ? 'Foggy' : 'Dry'
  return `${dry} till ${hour12(out.startH)}, then rain. Bring an umbrella.`
}

/** With real hourly millimetres, an hour with 0 mm is dry whatever its chance says, so the rain tips and the mini bars agree. Without them the chance stands. */
function mmGated(wx: Wx): Wx {
  const h = wx.hourly
  if (!h?.mm?.some((x) => x != null)) return wx
  return { ...wx, hourly: { ...h, prob: h.prob.map((p, i) => (h.mm![i] === 0 ? 0 : p)) } }
}

const deg = (n: number) => `${Math.round(n)}°`
const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }

/** The next three 3-hour slots from the current place-local hour: time, sky icon, rain chance. Empty without hourly data. */
function slots(wx: Wx, now: Date): Slot[] {
  const h = wx.hourly
  if (!h) return []
  const at = wxLocal(wx, now).slice(0, 13)
  const from = h.time.findIndex((t) => t.slice(0, 13) >= at)
  if (from < 0) return []
  return [0, 3, 6].map((k) => from + k).filter((i) => i < h.time.length).map((i) => ({ time: hourLabel(h.time[i]!), kind: kindOf(h.code?.[i] ?? null), pct: h.prob[i] ?? null, temp: h.temp?.[i] ?? null }))
}

const whereOf = (place: Parameters<typeof placeLineOf>[0]) => placeLineOf(place) // S4: one wording, location/placeWords

/** Simple mode's one weather line: temperature, words and today's rain chance. Nothing until a temperature is known (never a made-up 0). */
export function WeatherStrip() {
  const { place, point } = useWeatherPlace()
  const wx = useWeather(point)
  if (!wx || wx.temp == null || !place) return null
  const rain = wx.rainPct == null ? null : (wx.rainPct < 10 ? 'Low chance of rain' : `Rain chance ${Math.round(wx.rainPct)}%`)
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
export default function WeatherCard({ expanded = false, review = 0, noJack = false, storm = false, hero = false }: { expanded?: boolean; review?: number; noJack?: boolean; storm?: boolean; hero?: boolean }) {
  const { place, point } = useWeatherPlace()
  const ready = !!place && !!point && place.settled !== false // X7: no forecast for the home zone while the first position is still being found
  const wx = useWeather(ready ? point : null)
  if (!wx || wx.temp == null || !place || !ready) { // v13: Today keeps its hero slot with a plain empty state (never a made-up temperature)
    return hero ? (
      <a className="td-wxs td-wxs-empty" href={WEATHER_HREF} data-hero="" data-testid="weather-hero" aria-label="Weather">
        <b>Weather</b><span>Finding your weather. Open for the full forecast.</span>
      </a>
    ) : null
  }
  const now = new Date()
  const gx = mmGated(wx)
  const rn = reconcileNow(wx)
  const line = storm ? null : weatherActionLine(gx, now, null, rn.hideSun)
  const rainHero = !storm && gx.hourly ? heroRainLine(gx.hourly.time.map((time, i) => ({ time, prob: gx.hourly!.prob[i] ?? null })), wxLocal(wx, now)) : null // T5: from 30%, not only when the action line says rain
  const text = storm ? 'Rain and strong wind.' : line?.id === 'rain' ? rainSummary(gx, now) ?? line.text : line && line.rank >= 35 ? line.text : rainHero ?? line?.text ?? null // a heat, air or warning line outranks the plain rain mention; the UV tip does not
  // Jack only on an everyday rain or heat tip, in the expanded card. Never on a storm, an air alert or the Danger heat bands and above (rank 80+, D-91), and never when `noJack`.
  const jack: JackName | null = noJack || storm || !expanded ? null : line?.id === 'rain' ? 'ready-for-rain' : line?.id === 'heat' && line.rank < 80 ? 'drink-water' : null
  const href = line ? WEATHER_ACTION_HREF : WEATHER_HREF
  const cond = storm ? 'Thunderstorm' : `${rn.words[0]!.toUpperCase()}${rn.words.slice(1)}`
  // The same single "Feels like" and danger label as the Weather screen (scene.ts feelsLike): heat index when it applies, else the forecast's apparent temperature.
  const fl = feelsLike(wx.temp, wx.humidity, wx.feels)
  const feelsOn = fl.value != null && Math.round(fl.value) > Math.round(wx.temp)
  const feels = storm ? (fl.value != null ? `Feels ${deg(fl.value)}` : null) : feelsOn ? `Feels ${deg(fl.value!)}` : null
  const feelsBand = !storm && feelsOn ? fl.label || null : null // its own pill: a text separator let a line start with a dot
  const drink = !storm && !!fl.label // N5: "Drink water" from Extreme caution up
  const clock = clockIn(wx.at, placeTimezone(place.weather, wx.tz))
  const scene = <WeatherScene tod={storm ? 'night' : todOf(wxLocal(wx, now), wx.sunrise, wx.sunset)} cond={storm ? 'storm' : condOf(rn.code)} hot={!storm && isHot(wx.temp, wx.humidity)} afterSunset={pastSunset(wxLocal(wx, now), wx.sunset)} lite />
  const next = storm ? stormSlots(slots(wx, now)) : slots(wx, now) // T16: under a storm the slots agree with the title // both sizes: 56 px expanded, 40 px compact (PLAN 1.1 row 2)
  const locationOff = locationOffNote(place)
  const kicker = noBreak(`${locationOff ? zoneLabel(place.zone) : whereOf(place)}${clock ? ` · as of ${clock}` : ''}${offlineNote(wx)}`)
  const range = expanded ? [wx.high != null && `High ${deg(wx.high)}`, wx.low != null && `Low ${deg(wx.low)}`].filter(Boolean).join(' · ') : '' // live parity: today's range (V11 section B)
  const pills = (feels || drink) && (
    <span className="td-wxh-pills">{feels && <span className="td-wxh-pill">{feels}</span>}{feelsBand && <span className="td-wxh-pill">{feelsBand}</span>}{drink && <span className="td-wxh-pill">Drink water</span>}</span>
  )
  const box = expanded && text && (
    <span className="td-act-box"><b>{text}</b>{jack && <JackArt name={jack} size={56} decorative className="td-wx-jack" />}</span>
  )
  return (
    <section aria-label="Weather" className="td-wxs" data-size={expanded ? 'expanded' : 'compact'} data-hero data-contrast-bg="#1C2F57" data-testid="weather-hero" style={VEIL}>
      <SceneHero
        scene={scene}
        inkOnScene
        contrastBg="#1C2F57"
        compact={!expanded}
        kicker={kicker}
        title={<span className="td-wxh-top"><span className="td-wxh-t">{deg(wx.temp)}</span><span className="td-wxh-r"><span className="td-wxh-c">{cond}</span>{(range || pills) && <span className="td-wxh-sub">{range && <span className="td-wxh-hl">{range}</span>}{pills}</span>}</span></span>}
        body={(
          <>
            <RainNowChip rain={storm ? null : wx.rainingNow} />
            {locationOff && <p className="rn-off" data-testid="location-off">{locationOff}</p>}
            {!expanded && text && <span className="td-wxh-line">{text}</span>}
            {box}
            {expanded && <RainMini slots={miniSlots(wx, now, storm)} raining={wx.rainingNow?.value === true} />}
            {expanded && <HourlyStrip slots={hourlySlots(wx, now, storm)} />}
            {!expanded && next.length > 0 && (
              <ul className="td-wxh-hrs" aria-label="Next hours">
                {next.map((s) => <li key={s.time}><span className="td-wxh-st">{s.time}</span>{s.pct != null && <span className="td-wxh-sp" aria-label={s.pct < 10 ? 'Low chance of rain' : undefined}>{s.pct < 10 ? 'Low' : <>{Math.round(s.pct)}%<span className="td-vh"> chance of</span> rain</>}</span>}{s.temp != null && <span className="td-wxh-sd">{deg(s.temp)}</span>}</li>)}
              </ul>
            )}
            <ForecastNote className="td-wxh-credit" link place={locationOff ? undefined : placeNameOf(place)} sources={wx.sources} />
          </>
        )}
      >
        {expanded && <a className="td-wxh-full" href={WEATHER_HREF}>Full forecast<Icon name="chev" size={20} /></a>}
        <a className="td-wx-cover" href={href} aria-label={`Weather in ${placeNameOf(place)}, ${deg(wx.temp)}, ${cond}. Open the weather.`} />
        <span className="td-wx-chev" aria-hidden="true"><Icon name="chev" size={24} /></span>
      </SceneHero>
      {expanded && review > 0 && <MedsCheck review={review} quiet />}
    </section>
  )
}
