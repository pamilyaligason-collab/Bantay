import { useEffect, useMemo, useRef, useState } from 'react'
import { HOME_ZONES, type LatLon } from '../location/geo'
import { useLocation, usePlaceFrom } from '../location/useLocation'
import { track } from '../admin/events'
import { ALERTS_KEY, distanceKm, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { zoneAlert, ALERT_RADIUS_KM } from '../today/heroCards'
import { SubHeader } from '../shell/SubHeader'
import { actionLines } from './actionLine'
import { clockIn, conditionWords, hoursFrom, kindOf, nowLocal, useForecast, type Day, type Forecast, type Kind } from './forecast'
import { HEAT_BANDS, heatBand, heatIndexC } from './heatIndex'
import LiveMapToggle from './LiveMapToggle'
import './weather.css'

type Sel = 'me' | 'h1' | 'h2'
const NONE_A: Alert[] = []
const LINKS = [
  ['PAGASA', 'Warnings and typhoon bulletins', 'https://www.pagasa.dost.gov.ph/'],
  ['Project NOAH', 'Flood and landslide maps', 'https://noah.up.edu.ph/'],
  ['PANaHON', 'PAGASA hourly forecast map', 'https://www.panahon.gov.ph/']
] as const

const GLYPH: Record<Kind, string> = {
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  cloud: 'M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 8.5 4.8 4.8 0 0 1 17 18z',
  rain: 'M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 5.5 4.8 4.8 0 0 1 17 15zM9 18l-1 3M13 18l-1 3M17 18l-1 3',
  storm: 'M7 14a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 4.5 4.8 4.8 0 0 1 17 14zM12 14l-2 4h3l-2 4',
  fog: 'M7 12a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 2.5 4.8 4.8 0 0 1 17 12zM4 16h16M6 20h12'
}
const Glyph = ({ kind }: { kind: Kind }) => <svg className="wx-ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={GLYPH[kind]} /></svg>

const deg = (n: number | null) => (n == null ? '–' : `${Math.round(n)}°`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }
const dayLabel = (date: string, i: number) => (i === 0 ? 'Today' : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'UTC' }))

const rainWord = (p: number) => (p < 30 ? 'Low chance' : p < 60 ? 'Possible' : 'Likely')
const humidWord = (h: number) => (h < 40 ? 'Dry' : h < 60 ? 'Comfortable' : h < 75 ? 'Sticky' : 'Very humid')
const uvWord = (u: number) => (u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high: shade 10 AM-3 PM' : 'Extreme: shade 10 AM-3 PM')

function useOnlineNow() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const f = () => setOn(navigator.onLine !== false)
    addEventListener('online', f); addEventListener('offline', f)
    return () => { removeEventListener('online', f); removeEventListener('offline', f) }
  }, [])
  return on
}

/** #weather (or #weather?from=action when opened from an action line): the one full weather view. */
export default function WeatherScreen() {
  const l = useLocation()
  const place = usePlaceFrom(l)
  const gps: LatLon | null = l.source === 'gps' ? { lat: l.lat, lon: l.lon } : null
  const [pick, setPick] = useState<Sel | null>(null)
  const homeSel: Sel = place?.zone === HOME_ZONES[1].id ? 'h2' : 'h1'
  const sel: Sel = pick ?? (gps ? 'me' : homeSel)
  const point: LatLon | null = sel === 'me' ? gps ?? place?.weather ?? null : HOME_ZONES[sel === 'h1' ? 0 : 1]
  const name = sel === 'me' ? 'My location' : HOME_ZONES[sel === 'h1' ? 0 : 1].name.split(',')[0]!
  const { fc, offline, loading } = useForecast(point)
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const online = useOnlineNow()

  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    void track('action', 'weather_opened')
    if (/[?&]from=action(&|$)/.test(location.hash)) void track('action', 'weather_opened_action')
  }, [])
  useEffect(() => { document.querySelector('main.scroll')?.scrollTo?.(0, 0) }, [])

  return (
    <div className="wx">
      <SubHeader title="Weather" backHref="#today" backLabel="Back to Today" />
      <div className="wx-seg" role="group" aria-label="Place">
        <button type="button" aria-pressed={sel === 'me'} disabled={!gps} title={gps ? undefined : 'Location is off'} onClick={() => setPick('me')}>My location</button>
        <button type="button" aria-pressed={sel === 'h1'} onClick={() => setPick('h1')}>Home 1</button>
        <button type="button" aria-pressed={sel === 'h2'} onClick={() => setPick('h2')}>Home 2</button>
      </div>
      {fc && point ? <Body fc={fc} name={name} point={point} alerts={alerts} offline={offline || !online} /> : (
        <p className="wx-note" role="status">{loading ? 'Loading the forecast…' : 'Could not load the forecast. Check your connection and open this screen again.'}</p>
      )}
      <section aria-label="Official sources">
        <h2 className="wx-h">Official sources</h2>
        <div className="grp">
          {LINKS.map(([n, sub, url]) => (
            <a key={url} className="row" href={url} target="_blank" rel="noopener noreferrer"><span className="grow"><b>{n}</b><span className="sub">{sub}</span></span><span aria-hidden="true" className="wx-out">↗</span></a>
          ))}
        </div>
      </section>
      {point && <LiveMapToggle loc={point} />}
      <p className="wx-foot">Forecast: Open-Meteo. Your rounded location is sent only to the weather service.</p>
    </div>
  )
}

function Body({ fc, name, point, alerts, offline }: { fc: Forecast; name: string; point: LatLon; alerts: Alert[]; offline: boolean }) {
  const now = Date.now()
  const nl = nowLocal(fc, now)
  const today: Day | undefined = fc.daily[0]
  const c = fc.current
  const hi = heatIndexC(c.temp, c.humidity)
  const band = heatBand(hi)
  const next6 = hoursFrom(fc, 6, now)
  const rain6 = next6.length ? Math.max(...next6.map((h) => h.prob ?? 0)) : null
  const warn = useMemo(() => {
    const official = zoneAlert(alerts, point)
    if (official) return { kind: official.kind, title: official.title, doNow: official.doNow }
    const air = alerts.find((a) => a.kind === 'air' && !a.stale && (a.lat == null || a.lon == null || distanceKm(point, { lat: a.lat, lon: a.lon }) <= ALERT_RADIUS_KM))
    return air ? { kind: air.kind, title: air.title, doNow: air.doNow } : null
  }, [alerts, point])
  const lines = actionLines({ heatIndexC: hi, hourly: fc.hourly, nowLocal: nl, uvMax: today?.uvMax ?? null, warning: warn })
  const main = lines[0]
  const strip = hoursFrom(fc, 25, now).filter((_, i) => i % 3 === 0)
  const days = fc.daily.filter((d) => d.date)
  const lo = Math.min(...days.map((d) => d.min ?? Infinity))
  const hiAll = Math.max(...days.map((d) => d.max ?? -Infinity))
  const span = Math.max(1, hiAll - lo)
  const asOf = clockIn(fc.fetchedAt, fc.tz)

  return (
    <>
      <section aria-label="What to do" className={`wx-action${main ? ' on' : ''}`} data-id={main?.id ?? 'none'}>
        {main ? (
          <>
            <b className="wx-act-t">{main.text}</b>
            {main.band && <span className="wx-band">{main.band}</span>}
            {lines.slice(1).map((x) => <span key={x.id} className="wx-act-sub">{x.text}</span>)}
          </>
        ) : <b className="wx-act-t calm">Nothing to act on now. No heat, rain or strong sun to plan around.</b>}
      </section>

      {hi != null && (
        <div className="wx-scale" role="img" aria-label={`Heat levels: ${HEAT_BANDS.map((b) => `${b.label} ${b.min}${b.max === Infinity ? ' and up' : ` to ${b.max}`}`).join(', ')}. Now: ${band?.label ?? 'below Caution'}.`}>
          {HEAT_BANDS.map((b) => (
            <span key={b.id} className={band?.id === b.id ? 'on' : undefined}>{b.label}<br />{b.max === Infinity ? `${b.min}°+` : `${b.min}-${b.max}°`}</span>
          ))}
        </div>
      )}

      <section aria-label="Now" className="card wx-hero">
        <div className="wx-k">{name} · {offline ? `as of ${asOf}, offline` : `updated ${asOf}`}</div>
        <div className="wx-temp">{deg(c.temp)}</div>
        <b className="wx-cond">{cap(conditionWords(c.code))}</b>
        <span className="wx-sub">Feels like {deg(c.feels)} · High {deg(today?.max ?? null)} · Low {deg(today?.min ?? null)}</span>
      </section>

      <section aria-label="Details" className="wx-tiles">
        <div className="wx-tile"><span className="eyebrow">Rain next 6 h</span><b>{rain6 == null ? '–' : `${Math.round(rain6)}%`}</b><span className="wx-sub">{rain6 == null ? 'No data' : rainWord(rain6)}</span></div>
        <div className="wx-tile"><span className="eyebrow">Wind</span><b>{c.wind == null ? '–' : `${Math.round(c.wind)} km/h`}</b><span className="wx-sub">{c.gust == null ? 'Gusts unknown' : `Gusts ${Math.round(c.gust)}`}</span></div>
        <div className="wx-tile"><span className="eyebrow">Humidity</span><b>{c.humidity == null ? '–' : `${Math.round(c.humidity)}%`}</b><span className="wx-sub">{c.humidity == null ? 'No data' : humidWord(c.humidity)}</span></div>
        <div className="wx-tile"><span className="eyebrow">UV today</span><b>{today?.uvMax == null ? '–' : Math.round(today.uvMax)}</b><span className="wx-sub">{today?.uvMax == null ? 'No data' : uvWord(today.uvMax)}</span></div>
      </section>

      {strip.length > 0 && <section aria-label="Next 24 hours">
        <div className="wx-sech"><h2 className="wx-h">Next 24 hours</h2><span className="wx-sub">every 3 hours · swipe for more</span></div>
        <div className="card wx-stripbox">
          <ul className="wx-strip" tabIndex={0} aria-label="Next 24 hours, scrolls sideways">
            {strip.map((h, i) => (
              <li key={h.time}><span>{i === 0 ? 'Now' : hourLabel(h.time)}</span><Glyph kind={kindOf(h.code)} /><b>{deg(h.temp)}</b><span className="wx-rp" aria-label={`${Math.round(h.prob ?? 0)} percent rain`}>{h.prob == null ? '–' : `${Math.round(h.prob)}%`}</span></li>
            ))}
          </ul>
        </div>
      </section>}

      {days.length > 0 && <section aria-label="7 days">
        <h2 className="wx-h">7 days</h2>
        <ul className="card wx-days">
          {days.map((d, i) => (
            <li key={d.date}>
              <b>{dayLabel(d.date, i)}</b>
              <Glyph kind={kindOf(d.code)} />
              <span className="wx-lo">{deg(d.min)}</span>
              <span className="wx-range" aria-hidden="true"><i style={{ left: `${(((d.min ?? lo) - lo) / span) * 100}%`, right: `${((hiAll - (d.max ?? hiAll)) / span) * 100}%` }} /></span>
              <span className="wx-hi">{deg(d.max)}</span>
              <span className="wx-rp" aria-label={`${Math.round(d.prob ?? 0)} percent rain`}>{d.prob == null ? '–' : `${Math.round(d.prob)}%`}</span>
            </li>
          ))}
        </ul>
      </section>}
    </>
  )
}
