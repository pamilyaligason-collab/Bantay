import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { HOME_ZONES } from '../location/geo'
import { alertRef } from '../location/place'
import type { useLocation, usePlaceFrom } from '../location/useLocation'
import ZonePicker from '../location/ZonePicker'
import { Icon } from '../shell/Icon'
import SosHistory from '../sos/SosHistory'
import { HISTORY_KEY } from '../sos/history'
import { splitDial } from './dial'
import { type Entry, forZone, NOT_CONFIRMED, OVERRIDES_KEY, type Overrides, telHref, withOverrides } from './entries'
import EntryList, { EditForm } from './EntryList'
import { hazardsFor, type Tone } from './hazardCards'
import { ALERTS_KEY, type Alert } from './alerts'
import LiveMaps, { cyclones, STORM_VIEW, stormName, since, windySrc } from './LiveMaps'
import MapsPanel from './MapsPanel'
import NewsTop5 from './NewsTop5'
import PhoneWarnings from './PhoneWarnings'
import Practice from './Practice'
import SafetyBrief from './SafetyBrief'
import { useKv } from './store'
import './livemaps.css'
import './safety.css'

type Loc = ReturnType<typeof useLocation>
type Place = NonNullable<ReturnType<typeof usePlaceFrom>>

export const SUBS = ['warnings', 'weather', 'storms', 'map', 'dial', 'hazards', 'cards', 'sos'] as const
export type Sub = (typeof SUBS)[number]
/** '#safety/dial' -> 'dial'; anything else -> null (the hub). */
export const subOf = (hash: string): Sub | null => SUBS.find((s) => hash === `#safety/${s}`) ?? null

const TITLES: Record<Sub, string> = {
  warnings: 'Warnings', weather: 'Weather maps', storms: 'Storm tracker', map: 'Rescue map',
  dial: 'Quick dial', hazards: 'Hazards at my location', cards: 'Safety cards', sos: 'Past SOS'
}

// The orchestrator adds src/features/rescuemap/RescueMap.tsx; until then the page shows a small card.
const mods = import.meta.glob<{ RescueMap?: ComponentType<{ lat: number; lon: number; zoneName?: string }> }>('../rescuemap/RescueMap.tsx', { eager: true })
const RescueMap = Object.values(mods)[0]?.RescueMap

const NONE_A: Alert[] = []
const NONE_O: Overrides = {}

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const f = () => setOn(navigator.onLine !== false)
    addEventListener('online', f); addEventListener('offline', f)
    return () => { removeEventListener('online', f); removeEventListener('offline', f) }
  }, [])
  return on
}

/** Small 'i' detail sheet: where a number or reading came from. */
function InfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  // portal out of the scrolling screen so the sheet sits above the tab bar
  return createPortal(
    <div className="sf-sheet-bg" onClick={onClose}>
      <div className="sf-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="sf-sheet-h">{title}</h2>
        {children}
        <button type="button" className="btn" autoFocus onClick={onClose}>Close</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

function SourceInfo({ e }: { e: Entry }) {
  return (
    <p className="sf-sheet-p">
      {e.status === 'UNKNOWN' ? 'Not confirmed. ' : ''}Source: {e.source}, {e.date}.
      {e.sourceUrl && <> <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">Open the source</a></>}
    </p>
  )
}

function QuickDial({ zone }: { zone: string }) {
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const [info, setInfo] = useState<Entry | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const { groups, missing } = splitDial(withOverrides(forZone(hotlines as Entry[], zone), overrides))
  return (
    <div className="sf">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <p className="sec">{g.name}</p>
          <div className="sf-dials">
            {g.items.map((e) => (
              <div key={e.id} className="sf-dial">
                <a className="btn sf-call" href={telHref(e.phone)} aria-label={`Call ${e.name}, ${e.phone}`}>
                  <span>{e.name}</span><b>{e.phone}</b>
                </a>
                <button type="button" className="sf-i" aria-label={`Where ${e.name} came from`} onClick={() => setInfo(e)}>i</button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {missing.length > 0 && (
        <details>
          <summary>Numbers we still need (tap to add)</summary>
          {missing.map((e) => (
            <div key={e.id}>
              <div className="row">
                <span className="grow">{e.name}</span>
                <button className="sf-act" style={{ color: 'var(--warn)' }} onClick={() => setEditing(e.id)}>{NOT_CONFIRMED}</button>
                <button type="button" className="sf-i" aria-label={`Where ${e.name} came from`} onClick={() => setInfo(e)}>i</button>
              </div>
              {editing === e.id && <EditForm entry={e} geo={false} onDone={() => setEditing(null)} />}
            </div>
          ))}
        </details>
      )}
      {info && <InfoSheet title={info.name} onClose={() => setInfo(null)}><SourceInfo e={info} /></InfoSheet>}
    </div>
  )
}

const TONE: Record<Tone, string> = { good: 'Lower risk', warn: 'Take care', none: 'No reading yet' }

function HazardPage({ place }: { place: Place }) {
  const [src, setSrc] = useState(false)
  const v = hazardsFor(place.zone)
  const zone = HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]
  if (!v) return <p className="sf-empty">No hazard readings for this zone yet. <a href="https://hazardhunter.georisk.gov.ph/" target="_blank" rel="noopener noreferrer">Check HazardHunterPH</a>.</p>
  return (
    <div className="sf">
      <p className="sub" style={{ margin: '0 4px' }}>
        {place.source === 'gps' ? 'Closest home area we have readings for: ' : 'Readings for '}{zone.name}.
        <button type="button" className="sf-i" aria-label="Where these readings came from" onClick={() => setSrc(true)}>i</button>
      </p>
      {v.cards.map((c) => (
        <article key={c.id} className={`sf-hz-card ${c.tone}`} aria-label={c.title}>
          <div className="sf-hz-top"><h2>{c.title}</h2><span className="sf-hz-lvl">{TONE[c.tone]}</span></div>
          {c.readings.map((r) => (
            <p key={r.label} className="sf-hz-read">{c.readings.length > 1 && <>{r.label}: </>}<b>{r.value ?? 'Not confirmed yet'}</b></p>
          ))}
          <p className="sf-hz-do">{c.todo}</p>
        </article>
      ))}
      {v.rest.length > 0 && (
        <div className="grp">
          {v.rest.map((r) => (
            <div key={r.label} className="row sf-hz"><span className="grow">{r.label}</span><span>{r.value ?? 'Not confirmed yet'}</span></div>
          ))}
        </div>
      )}
      <a className="btn2 sf-ico" href={v.url} target="_blank" rel="noopener noreferrer">Open HazardHunterPH</a>
      {src && <InfoSheet title="Where these readings came from" onClose={() => setSrc(false)}><p className="sf-sheet-p">Source: {v.source}. Levels can change. Check HazardHunterPH for your exact street.</p></InfoSheet>}
    </div>
  )
}

const STORM_LINKS = [
  ['PAGASA bulletin', 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'],
  ['JTWC', 'https://www.metoc.navy.mil/jtwc/jtwc.html'],
  ['Zoom Earth', 'https://zoom.earth/maps/satellite/#view=12,128,5z']
]

function StormTracker() {
  const online = useOnline()
  const storms = cyclones(useKv<Alert[]>(ALERTS_KEY, NONE_A))
  return (
    <div className="sf">
      {storms.length ? (
        <div className="grp">
          {storms.map((a) => (
            <div key={a.id} className="row"><span className="grow"><span>{stormName(a)}</span><span className="sub" style={{ fontSize: 14 }}>{a.level ? `${a.level} alert` : 'Level unknown'} · since {since(a.issuedAt)}</span></span></div>
          ))}
        </div>
      ) : <p className="sf-empty" role="status">No active storms</p>}
      <div className="lm-box">
        {online
          ? <iframe className="sf-frame" title="Windy storm map of the Western Pacific" src={windySrc('wind', STORM_VIEW.lat, STORM_VIEW.lon, STORM_VIEW.zoom)} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
          : <p className="sf-empty lm-off" role="status">Maps need internet</p>}
      </div>
      <p className="sub lm-credit">Map by Windy.com</p>
      <div className="grp">
        {STORM_LINKS.map(([name, url]) => (
          <a key={url} className="row" href={url} target="_blank" rel="noopener"><span className="grow"><span>{name}</span><span className="sub" style={{ fontSize: 14 }}>Opens in a new tab.</span></span></a>
        ))}
      </div>
    </div>
  )
}

function PastSos() {
  const raw = useKv<unknown[]>(HISTORY_KEY, [])
  return Array.isArray(raw) && raw.length ? <SosHistory /> : <p className="sf-empty" role="status">No SOS sent from this phone yet.</p>
}

function Body({ sub, l, place }: { sub: Sub; l: Loc; place: Place }) {
  switch (sub) {
    case 'warnings':
      return (
        <>
          <section aria-labelledby="s-warn"><h2 id="s-warn" className="hd">Warnings</h2><SafetyBrief loc={alertRef(place)} /></section>
          <PhoneWarnings level={2} />
          <section aria-labelledby="s-news"><h2 id="s-news" className="hd">News</h2><NewsTop5 /></section>
        </>
      )
    case 'weather':
      return (
        <>
          <section aria-labelledby="s-wx"><h2 id="s-wx" className="hd">Live weather</h2><LiveMaps loc={place.weather} /></section>
          <section aria-labelledby="s-map"><h2 id="s-map" className="hd">Live maps</h2><MapsPanel loc={place.source !== 'zone' ? place.weather : null} ask={l.ask} zone={place.zone} /></section>
        </>
      )
    case 'storms': return <StormTracker />
    case 'map':
      return (
        <>
          {RescueMap
            ? <RescueMap lat={place.weather.lat} lon={place.weather.lon} zoneName={HOME_ZONES.find((z) => z.id === place.zone)?.name} />
            : <p className="sf-note" role="status">Map coming. For now, use the places below.</p>}
          <section aria-labelledby="s-evac"><h2 id="s-evac" className="hd">Evacuation and rescue</h2><EntryList seed={places as Entry[]} geo zone={place.zone} /></section>
        </>
      )
    case 'dial': return <QuickDial zone={place.zone} />
    case 'hazards': return <HazardPage place={place} />
    case 'cards': return <Practice />
    case 'sos': return <PastSos />
  }
}

/** A Safety sub-page: back button, title, the place chip, then the page. */
export default function SafetySub({ sub, l, place }: { sub: Sub; l: Loc; place: Place | null }) {
  useEffect(() => { document.querySelector('main.scroll')?.scrollTo?.(0, 0) }, [sub])
  return (
    <>
      <div className="hdr sf-hdr sf-subhdr">
        <a className="sh-iconbtn" href="#safety" aria-label="Back to Safety"><Icon name="back" /></a>
        <h1>{TITLES[sub]}</h1>
        <ZonePicker loc={l} />
      </div>
      {place && <Body sub={sub} l={l} place={place} />}
    </>
  )
}
