import { type ReactNode, useEffect, useState } from 'react'
import { RescueMap } from '../rescuemap/RescueMap'
import { createPortal } from 'react-dom'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { HOME_ZONES } from '../location/geo'
import { alertRef } from '../location/place'
import type { useLocation, usePlaceFrom } from '../location/useLocation'
import ZonePicker from '../location/ZonePicker'
import { SubHeader } from '../shell/SubHeader'
import SosHistory from '../sos/SosHistory'
import { HISTORY_KEY } from '../sos/history'
import { splitDial } from './dial'
import { TileIcon } from './SafetyHub'
import { type Entry, forZone, OVERRIDES_KEY, type Overrides, telHref, withOverrides } from './entries'
import EntryList, { EditForm } from './EntryList'
import { hazardLabel, hazardsFor } from './hazardCards'
import { ALERTS_KEY, type Alert } from './alerts'
import LiveMaps, { cyclones, STORM_VIEW, stormLine, stormName, since, windySrc } from './LiveMaps'
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

const initials = (n: string) => n.split(/[\s/(]+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

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
          <ul className="sf-people">
            {g.items.map((e) => (
              <li key={e.id} className="sf-person">
                <span className="sf-av" aria-hidden="true">{initials(e.name)}</span>
                <span className="sf-pt"><b>{e.name}</b><span className="sub">{g.name} · {e.phone}</span></span>
                <button type="button" className="sf-i" aria-label={`Where ${e.name} came from`} onClick={() => setInfo(e)}>i</button>
                <a className="sf-callbtn" href={telHref(e.phone)} aria-label={`Call ${e.name}, ${e.phone}`}><TileIcon name="dial" /></a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {missing.length > 0 && (
        <section aria-label="Add a local number">
          <p className="sec">Add a local number</p>
          <p className="sub" style={{ margin: '0 4px' }}>We could not find an official number for these yet. If you know one, add it.</p>
          <ul className="sf-people">
            {missing.map((e) => (
              <li key={e.id} className="sf-person-wrap">
                <div className="sf-person">
                  <span className="sf-av sf-av-add" aria-hidden="true">+</span>
                  <span className="sf-pt"><b>{e.name}</b><span className="sub">Not confirmed yet</span></span>
                  <button type="button" className="sf-i" aria-label={`Where ${e.name} came from`} onClick={() => setInfo(e)}>i</button>
                  <button type="button" className="btn2 sf-addbtn" aria-label={`Add number for ${e.name}`} onClick={() => setEditing(editing === e.id ? null : e.id)}>Add</button>
                </div>
                {editing === e.id && <EditForm entry={e} geo={false} onDone={() => setEditing(null)} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      {info && <InfoSheet title={info.name} onClose={() => setInfo(null)}><SourceInfo e={info} /></InfoSheet>}
    </div>
  )
}

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
          <div className="sf-hz-top"><h2>{c.title}</h2><span className="sf-hz-lvl">{hazardLabel(c)}</span></div>
          {c.readings.length > 1 && c.readings.map((r) => (
            <p key={r.label} className="sf-hz-read">{r.label}: <b>{r.value ?? 'Not confirmed yet'}</b></p>
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

function StormTracker({ place }: { place: Place }) {
  const online = useOnline()
  const storms = cyclones(useKv<Alert[]>(ALERTS_KEY, NONE_A))
  const zone = HOME_ZONES.find((z) => z.id === place.zone)
  const line = stormLine(storms, place.weather, (zone?.name ?? 'your place').split(',')[0]!)
  return (
    <div className="sf">
      <p className={`sf-storm-line ${line.tone}`} role="status">{line.text}</p>
      {storms.length ? (
        <div className="grp">
          {storms.map((a) => (
            <div key={a.id} className="row"><span className="grow"><span>{stormName(a)}</span><span className="sub" style={{ fontSize: 14 }}>{a.level ? `${a.level} alert` : 'Level unknown'} · since {since(a.issuedAt)}</span></span></div>
          ))}
        </div>
      ) : null}
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
          <section aria-label="Official warnings"><SafetyBrief loc={alertRef(place)} /></section>
          <PhoneWarnings level={2} />
          <section aria-labelledby="s-news"><h2 id="s-news" className="hd">Safety news</h2><NewsTop5 /></section>
        </>
      )
    case 'weather':
      return (
        <>
          <section aria-labelledby="s-wx"><h2 id="s-wx" className="hd">Live weather</h2><LiveMaps loc={place.weather} /></section>
          <section aria-labelledby="s-map"><h2 id="s-map" className="hd">Live maps</h2><MapsPanel loc={place.source !== 'zone' ? place.weather : null} ask={l.ask} zone={place.zone} /></section>
        </>
      )
    case 'storms': return <StormTracker place={place} />
    case 'map':
      return (
        <>
          <RescueMap lat={place.weather.lat} lon={place.weather.lon} zoneName={HOME_ZONES.find((z) => z.id === place.zone)?.name} />
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
      <SubHeader title={TITLES[sub]} backHref="#safety" backLabel="Back to Safety" trailing={<ZonePicker loc={l} />} className="sf-hdr sf-subhdr" />
      {place && <Body sub={sub} l={l} place={place} />}
    </>
  )
}
