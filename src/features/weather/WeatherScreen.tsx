import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon } from '../location/geo'
import { liveQuery } from 'dexie'
import { db } from '../../db'
import { ZONE_KEY } from '../location/useLocation'
import { FOLLOW_KEY, useWeatherPlace } from './weatherPlace'
import { needsPrecise, oldFixNote, weatherFixState } from '../location/freshness'
import { track } from '../admin/events'
import { ALERTS_KEY, CHECKED_KEY, NO_STALE, STALE_KEY, feedStale, type Alert, type StaleSources } from '../safety/alerts'
import { putKv, useKv } from '../safety/store'
import { useOnline } from '../safety/LiveMaps'
import { EmptyState } from '../look/EmptyState'
import { Icon, type IconName } from '../shell/Icon'
import { GroupedList } from '../look/GroupedList'
import { LargeTitle } from '../look/LargeTitle'
import { Row } from '../look/Row'
import { Section } from '../look/Section'
import ZonePicker from '../location/ZonePicker'
import { placeName } from '../safety/warningsLogic'
import { placeLineOf, placeNameOf } from '../today/placeName'
import { adviceLine, CALM_LINE } from './advice'
import { tempTint } from './tempTint'
import { alertRef, placeTimezone } from '../location/place'
import { actionLines, RAIN_WATCH_HOURS } from './actionLine'
import StormTrack from './StormTrack'
import { clockIn, conditionWords, hoursFrom, kindOf, nowLocal, type Day, type Forecast, type Kind } from './forecast'
import { heatIndexC } from './heatIndex'
import { creditIds, ForecastNote } from './ForecastNote'
import { wxFlag } from './flags'
import { AroundYou, Credits, Next2h, OtherNotices } from './BlendCards'
import { useBlendedWeather, type BlendedState } from './useBlendedWeather'
import { condOf, feelsLike, isHot, SCRIM, SKY, todOf } from './scene'
import WeatherScene from './WeatherScene'
import { LiveMapCard, StormLineCard, StormsNear, useWxPause } from './WxLive'
import { hasAdvisory } from './advisory'
import RainMap from './RainMap'
import { weatherWarning } from './warning'
import { useNow } from '../safety/AlertCard'
import '../today/weatherHero.css' // the Next 2 hours bars (td-rm) are drawn by Today's RainMini
import { Next2hMini } from './Next2hMini'
import AirCard from './AirCard'
import SunArc from './SunArc'
import { syncRainReminder } from './rainRemind'
import './weather.css'
import './wxs7w.css'

const NONE_A: Alert[] = []
const LINKS = [
  ['PAGASA', 'Warnings and typhoon bulletins', 'https://www.pagasa.dost.gov.ph/'],
  ['Project NOAH', 'Flood and landslide maps', 'https://noah.up.edu.ph/'],
  ['PANaHON', 'PAGASA hourly forecast map', 'https://www.panahon.gov.ph/']
] as const

const Glyph = ({ kind }: { kind: Kind }) => <Icon name={kind} tone="weather" />

/** Icon for the warning that tops the action line: cyclone, quake, flood, storm, heat, else a plain warning triangle. */
const WARN_ICON: Record<string, IconName> = { tcws: 'typhoon', quake: 'quake', rainfall: 'flood', thunderstorm: 'storm', heat: 'therm', tsunami: 'flood' }

const deg = (n: number | null) => (n == null ? 'n/a' : `${Math.round(n)}°`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }
const dayLabel = (date: string, i: number) => (i === 0 ? 'Today' : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'UTC' }))

const humidWord = (h: number) => (h < 40 ? 'Dry' : h < 60 ? 'Comfortable' : h < 75 ? 'Sticky' : 'Very humid')
const uvWord = (u: number) => (u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high: shade 10 AM-3 PM' : 'Extreme: shade 10 AM-3 PM')

/** Re-renders once a minute and on return to the app, so the time of day and "rain next 12 h" never go stale on an open screen. */
function useMinuteTick() {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    const t = setInterval(f, 60_000)
    document.addEventListener('visibilitychange', f)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', f) }
  }, [])
}

/** #weather (or #weather?from=action when opened from an action line): the one full weather view. */
export default function WeatherScreen() {
  useMinuteTick() // the sky, the words and the card order follow the clock as well as the forecast
  const { gpsLoc, l, place, point, fix, follow, rawFix, hasFix, zoneWins } = useWeatherPlace()
  const fixAt = 'at' in gpsLoc ? gpsLoc.at : undefined
  const settled = gpsLoc.source !== 'pending'
  const refined = useRef(false)
  useEffect(() => { // a stored fix older than 30 min: one fresh high-accuracy read, no prompt
    if (refined.current || !settled || !rawFix || !needsPrecise(gpsLoc.at, Date.now())) return
    refined.current = true
    void gpsLoc.refine()
  }, [settled, rawFix, gpsLoc])
  const oldFix = hasFix && !zoneWins && weatherFixState(fixAt, Date.now()) === 'old'
  useEffect(() => { // a pick from the zone chip (ZONE_KEY written after this screen opened) means "follow the zone"
    let first = true
    const sub = liveQuery(() => db.kv.get(ZONE_KEY)).subscribe({ next: () => { if (first) first = false; else void putKv(FOLLOW_KEY, 'zone') }, error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  const [finding, setFinding] = useState(false) // GPS can take up to ~30 s
  const [locOff, setLocOff] = useState(false)
  const bl = useBlendedWeather(point, { on: wxFlag('blend') }) // flag off: the direct forecast, exactly as before
  const { fc, offline, loading } = bl
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const online = useOnline()
  const pause = useWxPause()
  const warnAt = place ? alertRef(place) : point // the sentences below name this place: home for a phone abroad, never its foreign position
  const now = useNow() // a quake ages out of D-114 terms and a warning of its window while the screen stays open
  const warn = useMemo(() => (warnAt ? weatherWarning(alerts, warnAt, false) : null), [alerts, warnAt, now])
  const unchecked = feedStale(alerts, useKv<unknown>(CHECKED_KEY, null), useKv<StaleSources>(STALE_KEY, NO_STALE)) // no "no warning" wording or green tint without a fresh check

  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    void track('action', 'weather_opened')
    if (/[?&]from=action(&|$)/.test(location.hash)) void track('action', 'weather_opened_action')
  }, [])
  useEffect(() => { document.querySelector('main.scroll')?.scrollTo?.(0, 0) }, [])
  useEffect(() => { void syncRainReminder() }, []) // the rain reminder is also re-planned whenever this screen opens

  const askLoc = async () => {
    if (finding) return
    setFinding(true); setLocOff(false)
    const got = (await l.ask().catch(() => null))?.source === 'gps'
    setFinding(false); if (!got) setLocOff(true)
  }

  // X1: the whole page is the sky (stops from scene.ts, under the same veil as the hero), cards sit on it as glass. The page gradient lives on the scroll box so it fills the screen edge to edge.
  const [sky0, sky1] = SKY[fc ? todOf(nowLocal(fc, Date.now()), fc.daily[0]?.sunrise, fc.daily[0]?.sunset) : 'night']
  const veil = (hex: string) => [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - SCRIM) + [5, 12, 28][(i - 1) / 2]! * SCRIM))
  const lum = (c: number[]) => c.reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i]! * (((v / 255 + 0.055) / 1.055) ** 2.4), 0)
  const [c0, c1] = [veil(sky0), veil(sky1)]
  const lit = lum(c0) > lum(c1) ? c0 : c1 // white text is worst over the lightest stop
  const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  useEffect(() => {
    const sc = document.querySelector<HTMLElement>('.bt .scroll')
    const bt = sc?.closest<HTMLElement>('.bt')
    if (!sc || !bt) return
    sc.style.backgroundImage = `linear-gradient(rgba(5,12,28,${SCRIM}), rgba(5,12,28,${SCRIM})), linear-gradient(to bottom, ${sky0}, ${sky1})`
    bt.dataset.wx = ''; bt.style.setProperty('--wx-end', hex(c1))
    return () => { sc.style.backgroundImage = ''; delete bt.dataset.wx; bt.style.removeProperty('--wx-end') }
  }, [sky0, sky1]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="wx" data-testid="wx-root" data-contrast-bg={hex(lit)}>
      <LargeTitle back={{ href: '#today', label: 'Today' }} title="Weather" actions={<ZonePicker loc={l} />} />
      {oldFix && fixAt != null && <p className="wx-note" role="status" data-testid="wx-fix-old">{oldFixNote(fixAt, Date.now())} <button type="button" className="btn" disabled={finding} onClick={askLoc}>{finding ? 'Finding you…' : 'Update my location'}</button></p>}
      {locOff && !fix && <p className="wx-note" role="status">Location is off for Bantay. Turn it on in your phone settings to use your own weather.</p>}
      {fc && point ? <Body fc={fc} name={placeNameOf(place)} line={placeLineOf(place)} unchecked={unchecked} point={point} stormFrom={warnAt ?? point} stormPlace={place ? placeName(place) : placeNameOf(place)} alerts={alerts} warn={warn} offline={offline || !online} online={online} bl={bl} pause={pause} /> : (
        <>
          {warnAt && <WarnRow warn={warn} unchecked={unchecked} name={placeNameOf(place)} />}
          {warnAt && hasAdvisory(alerts) && <StormCard alerts={alerts} point={warnAt} place={place ? placeName(place) : placeNameOf(place)} />}
          <p className="wx-note" role="status">{loading ? 'Loading the forecast…' : 'Could not load the forecast. Check your connection and open this screen again.'}</p>
          {/* shortcut: a failed forecast that later succeeds swaps this tree for Body, so the map card mounts again and asks Windy a second time; lift the map above the branch if that ever matters */}
          {point && !loading && <LiveMapCard point={point} pause={pause} />}
        </>
      )}
      {point || l.source === 'pending' || follow === undefined ? null : ( // the empty card stays only when no point exists at all (D-125)
        <section aria-label="Live weather map" className="card wx-map wx-map-empty">
          <p>Your position is not known yet, so the map has nothing to centre on.</p>
          <button type="button" className="btn" disabled={finding} onClick={askLoc}>{finding ? 'Finding you…' : 'Find me'}</button>
        </section>
      )}
      <Section title="Official" testId="wx-official">
        <div className="grp" role="group" aria-label="Official sources">
          {LINKS.map(([n, sub, url]) => (
            <a key={url} className="row" href={url} target="_blank" rel="noopener noreferrer"><span className="grow"><b>{n}</b><span className="sub">{sub}</span></span><span className="wx-out"><Icon name="out" size={20} /></span></a>
          ))}
        </div>
        <div className="card wx-made">
          <h3>How this is made</h3>
          {bl.blended ? <Credits sources={bl.sources} station={bl.check?.name ?? null} /> : <p className="wx-sub">Forecast for your spot (rounded to about 1 km) from Open-Meteo. Its global weather models work on a grid of roughly 10 km, so a shower over one street can be missed. Official warnings: PAGASA.</p>}
          <p className="wx-sub">{wxFlag('blend') ? "Your location, rounded to about 1 km, goes to Bantay's server, which asks the weather services. The map gets the same rounded location." : 'Your rounded location is sent only to the weather and map services.'}</p>
        </div>
      </Section>
    </div>
  )
}

/** A listed storm needs no forecast either: it sits under the warning row while the forecast loads, fails, or is shown. */
function StormCard({ alerts, point, place }: { alerts: Alert[]; point: LatLon; place: string }) {
  return <section aria-label="Storm track" className="card wx-rain" data-testid="wx-storm"><StormTrack alerts={alerts} point={point} placeName={place} /></section>
}

/** Needs no forecast: a warning must show while the forecast is loading or could not load. */
function WarnRow({ warn, unchecked, name }: { warn: ReturnType<typeof weatherWarning>; unchecked: boolean; name: string }) {
  return (
    <div data-testid="wx-warn"><GroupedList icons>
      <Row icon="warn" tint={warn ? 'red' : unchecked ? 'amber' : 'green'} title="Official warnings" sub={warn ? warn.title : unchecked ? 'Not checked lately. Open Warnings or check PAGASA.' : `PAGASA: no warning near ${name}`} href="#safety/warnings" />
    </GroupedList></div>
  )
}

function Body({ fc, name, line, unchecked, point, stormFrom, stormPlace, alerts, warn, offline, online, bl, pause }: { fc: Forecast; name: string; line: string; unchecked: boolean; point: LatLon; stormFrom: LatLon; stormPlace: string; alerts: Alert[]; warn: ReturnType<typeof weatherWarning>; offline: boolean; online: boolean; bl: BlendedState; pause: ReturnType<typeof useWxPause> }) {
  const now = Date.now()
  const nl = nowLocal(fc, now)
  const today: Day | undefined = fc.daily[0]
  const c = fc.current
  const hi = heatIndexC(c.temp, c.humidity)
  const fl = feelsLike(c.temp, c.humidity, c.feels)
  const nextRain = hoursFrom(fc, RAIN_WATCH_HOURS, now)
  const known = nextRain.flatMap((h) => (h.prob == null ? [] : [h.prob]))
  const rainNext = known.length ? Math.max(...known) : null // unknown stays unknown, never 0%
  const cond = condOf(c.code)
  const raining = cond === 'drizzle' || cond === 'rain' || cond === 'storm'
  let lines = actionLines({ heatIndexC: hi, hourly: fc.hourly, nowLocal: nl, uvMax: today?.uvMax ?? null, warning: warn })
  if (raining) { // it is falling now: never "nothing to plan around" or a strong-sun tip under a rainy hero, even when the hourly chances are low
    lines = lines.filter((x) => x.id !== 'uv')
    if (!lines.some((x) => x.id === 'rain')) lines = [...lines, { id: 'rain' as const, rank: 50, text: cond === 'storm' ? 'Thunderstorm now' : 'Raining now' }].sort((a, b) => b.rank - a.rank)
  }
  const main = lines[0]
  const strip = hoursFrom(fc, 49, now).filter((_, i) => i % 3 === 0)
  const days = fc.daily.filter((d) => d.date)
  const lo = Math.min(...days.map((d) => d.min ?? Infinity))
  const hiAll = Math.max(...days.map((d) => d.max ?? -Infinity))
  const span = Math.max(1, hiAll - lo)
  const dayIn = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: placeTimezone(point, fc.tz) })
  const asOf = clockIn(fc.fetchedAt, placeTimezone(point, fc.tz)) + (dayIn(new Date(fc.fetchedAt)) === dayIn(new Date(now)) ? '' : ' yesterday') // a reading is kept at most 24 hours
  const [allDays, setAllDays] = useState(false) // 5 days first, all 10 on a tap: keeps the screen inside its D-102 budget

  const daily = today?.prob ?? null
  // "later today" must mean hours still to come: the peak of today's remaining hours, not the day's max (which may be past)
  const leftToday = fc.hourly.filter((h) => h.time.slice(0, 10) === nl.slice(0, 10) && h.time.slice(0, 13) >= nl.slice(0, 13)).map((h) => h.prob ?? 0)
  const advice = adviceLine(leftToday.length ? Math.max(...leftToday) : null, rainNext, lines, fc.daily[1]?.prob ?? null)

  // A3: the page follows the weather. Wet (raining now, or rain likely in the next 12 h): the rain card leads and Rain next 12 h takes the Sunrise tile. Dry: the 48-hour strip leads and Sunrise stays.
  const wet = raining || lines.some((x) => x.id === 'rain')
  const storms = hasAdvisory(alerts, now)
  const rainCard = <RainMap key="rain" fc={fc} placeName={name} daily={daily} nextRain={rainNext} />
  const stripCard = strip.length > 0 && (
    <Section key="48" title="Next 48 hours" meta="every 3 h · rain chance" testId="wx-48">
      <div className="card wx-stripbox">
        <ul className="wx-strip" tabIndex={0} aria-label="Next 48 hours, scrolls sideways">
          {strip.map((h, i) => (
            <li key={h.time}><span>{i === 0 ? 'Now' : hourLabel(h.time)}</span><Glyph kind={kindOf(h.code)} /><b>{deg(h.temp)}</b><span className="wx-rp" aria-label={h.prob == null ? 'Rain chance not known' : `${Math.round(h.prob)} percent chance of rain`}>{h.prob == null ? 'n/a' : `${Math.round(h.prob)}% rain`}</span></li>
          ))}
        </ul>
      </div>
    </Section>
  )

  return (
    <>
      <section aria-label="Now" className="card wx-hero wxs-host" data-hero data-testid="wx-hero">
        <WeatherScene tod={todOf(nl, today?.sunrise, today?.sunset)} cond={condOf(c.code)} hot={isHot(c.temp, c.humidity)} />
        <div className="wx-k">{line}</div>
        <span className="wx-sub wx-stamp">{offline ? `as of ${asOf}, ${online ? 'could not refresh' : 'offline'}` : `Updated ${asOf}`}</span>
        <div className="wx-temp">{deg(c.temp)}</div>
        <b className="wx-cond">{cap(conditionWords(c.code))}</b>
        <span className="wx-sub">Feels like {deg(fl.value)}</span>
        <span className="wx-sub">H:{deg(today?.max ?? null)}  L:{deg(today?.min ?? null)}</span>
        <ForecastNote className="wx-sub wx-fnote" place={name} link sources={creditIds(bl)} />
      </section>

      <WarnRow warn={warn} unchecked={unchecked} name={name} />

      {storms && <StormsNear alerts={alerts} point={stormFrom} place={stormPlace} pause={pause} />}
      {bl.blended && <OtherNotices alerts={bl.alerts} now={now} />}

      <section aria-label="What to do" className={`wx-action${main ? ' on' : ''}`} data-id={main?.id ?? 'none'} data-testid="wx-advice">
        {main ? (
          <>
            {main.id === 'warning' && warn && <Icon name={WARN_ICON[warn.kind] ?? 'warn'} tone="alert" boxed size={20} />}
            <b className="wx-act-t">{main.text}</b>
            {main.band && <span className="wx-band">{main.band}</span>}
            {lines.slice(1).map((x) => <span key={x.id} className="wx-act-sub">{x.text}</span>)}
          </>
        ) : <b className={`wx-act-t${advice === CALM_LINE ? ' calm' : ''}`}>{advice}</b>}
      </section>

      {wxFlag('blend') ? (bl.blended ? <Next2h slots={bl.next2h} offline={offline} now={now} /> : <Section title="Next 2 hours"><EmptyState title="Not available yet" body="Minute-by-minute rain needs the blended forecast." /></Section>) : <Next2hMini fc={fc} offline={offline} now={now} />}

      <LiveMapCard point={point} pause={pause} />

      {wet ? <>{rainCard}{stripCard}</> : <>{stripCard}{rainCard}</>}

      {!storms && <StormLineCard alerts={alerts} point={stormFrom} place={stormPlace} />}

      {days.length > 0 && <Section title="10 days" meta="rain chance" testId="wx-10">
        <ul className="card wx-days">
          {(allDays ? days : days.slice(0, 5)).map((d, i) => (
            <li key={d.date}>
              <b>{dayLabel(d.date, i)}</b>
              <Glyph kind={kindOf(d.code)} />
              <span className="wx-lo">{deg(d.min)}</span>
              <span className="wx-range" aria-hidden="true"><i style={{ left: `${(((d.min ?? lo) - lo) / span) * 100}%`, right: `${((hiAll - (d.max ?? hiAll)) / span) * 100}%`, background: `linear-gradient(90deg, var(${tempTint(d.min ?? lo)}), var(${tempTint(d.max ?? hiAll)}))` }} /></span>
              <span className="wx-hi">{deg(d.max)}</span>
              <span className="wx-rp" aria-label={d.prob == null ? 'Rain chance not known' : `${Math.round(d.prob)} percent chance of rain`}>{d.prob == null ? 'n/a' : `${Math.round(d.prob)}%`}</span>
            </li>
          ))}
        </ul>
        {days.length > 5 && <button type="button" className="btn2 wx-more" aria-expanded={allDays} onClick={() => setAllDays((v) => !v)}>{allDays ? 'Show fewer days' : `Show all ${days.length} days`}</button>}
      </Section>}

      <AirCard point={point} />

      {bl.blended && !offline && <AroundYou air={bl.aqi} />}

      <SunArc fc={fc} now={now} />

      <section aria-label="Details" className="wx-tiles" data-testid="wx-details">
        <div className="wx-tile"><span className="eyebrow">Wind</span><b>{c.wind == null ? 'n/a' : `${Math.round(c.wind)} km/h`}</b><span className="wx-sub">{c.gust == null ? 'Gusts unknown' : `Gusts ${Math.round(c.gust)}`}</span></div>
        <div className="wx-tile"><span className="eyebrow">Humidity</span><b>{c.humidity == null ? 'n/a' : `${Math.round(c.humidity)}%`}</b><span className="wx-sub">{c.humidity == null ? 'No data' : humidWord(c.humidity)}</span></div>
        <div className="wx-tile"><span className="eyebrow">UV today</span><b>{today?.uvMax == null ? 'n/a' : Math.round(today.uvMax)}</b><span className="wx-sub">{today?.uvMax == null ? 'No data' : uvWord(today.uvMax)}</span></div>
        {wet ? <div className="wx-tile"><span className="eyebrow">Rain next 12 h</span><b>{rainNext == null ? 'n/a' : `${Math.round(rainNext)}%`}</b><span className="wx-sub">{rainNext == null ? 'No data' : 'Highest chance'}</span></div> : <div className="wx-tile"><span className="eyebrow">Sunrise</span><b>{today?.sunrise ? clockIn(`${today.sunrise}:00Z`, 'UTC') : 'n/a'}</b><span className="wx-sub">{today?.sunset ? `Sunset ${clockIn(`${today.sunset}:00Z`, 'UTC')}` : 'No data'}</span></div>}
      </section>
    </>
  )
}
