import { type ReactNode, useEffect, useState } from 'react'
import { RescueMap } from '../rescuemap/RescueMap'
import { createPortal } from 'react-dom'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { HOME_ZONES } from '../location/geo'
import type { useLocation, usePlaceFrom } from '../location/useLocation'
import ZonePicker from '../location/ZonePicker'
import { LargeTitle } from '../look'
import SosHistory from '../sos/SosHistory'
import { HISTORY_KEY } from '../sos/history'
import { getMember, onAuthChange } from '../auth/session'
import { ABROAD_SOURCE, CHECK_LABEL, coversHere, isLink, needsCheck, planDial, splitDial } from './dial'
import { dialNumber, type Entry, firstNumber, OVERRIDES_KEY, type Overrides, telHref, withFamilyAdded } from './entries'
import EntryList, { EditForm } from './EntryList'
import type { Alert } from './alerts'
import LiveMapToggle from '../weather/LiveMapToggle'
import MapsPanel from './MapsPanel'
import PhoneAlertsPage from './PhoneAlertsPage'
import FirstAidList from './FirstAidList'
import HazardPage from './HazardsPage'
import OfflineMaps from './OfflineMaps'
import StormTracker from './StormTracker'
import Warnings from './Warnings'
import World from '../world/World'
import AlertSettings from '../world/AlertSettings'
import Practice from './Practice'
import { useKv } from './store'
import './livemaps.css'
import './safety.css'

type Loc = ReturnType<typeof useLocation>
export type Place = NonNullable<ReturnType<typeof usePlaceFrom>>

export const SUBS = ['warnings', 'weather', 'storms', 'map', 'dial', 'hazards', 'cards', 'sos', 'sources', 'phonewarn', 'firstaid', 'world', 'offline', 'alerts'] as const
export type Sub = (typeof SUBS)[number]
/** '#safety/dial' -> 'dial'; anything else -> null (the hub). */
export const subOf = (hash: string): Sub | null => SUBS.find((s) => hash === `#safety/${s}`) ?? null

const TITLES: Record<Sub, string> = {
  warnings: 'Warnings', weather: 'Weather maps', storms: 'Storm tracker', map: 'Rescue map',
  dial: 'Quick dial', hazards: 'Hazards at my location', cards: 'Safety cards', sos: 'Past SOS', sources: 'Sources', phonewarn: 'Phone warnings',
  firstaid: 'First aid', world: 'Safety', offline: 'Offline maps', alerts: 'World alerts'
}


export const NONE_A: Alert[] = []
const NONE_O: Overrides = {}

export function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const f = () => setOn(navigator.onLine !== false)
    addEventListener('online', f); addEventListener('offline', f)
    return () => { removeEventListener('online', f); removeEventListener('offline', f) }
  }, [])
  return on
}

/** Small 'i' detail sheet: where a number or reading came from. */
export function InfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
      {e.phone && firstNumber(e.phone) !== e.phone ? <>Numbers: {e.phone}. The Call button dials the first. </> : null}
      {e.status === 'UNKNOWN' ? 'Not confirmed. ' : ''}{e.status === 'UNVERIFIED' ? 'Number not yet confirmed. ' : ''}Source: {e.source}, {e.date}.
      {e.sourceUrl && <> <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">Open the source</a></>}
    </p>
  )
}

function DialRow({ e, onInfo, abroad }: { e: Entry; onInfo: (e: Entry) => void; abroad: boolean }) {
  const link = isLink(e)
  return (
    <li className="sf-dialrow">
      <span className="sf-dt">
        <b>{e.name}</b>
        <span className="sub">
          {e.group}{e.phone ? ` · ${dialNumber(e.phone, abroad)}` : ''}
          {!link && needsCheck(e) && <span className="sf-chk" role="img" aria-label={CHECK_LABEL} title={CHECK_LABEL}>check</span>}
        </span>
      </span>
      <button type="button" className="sf-i" aria-label={`Where ${e.name} came from`} onClick={() => onInfo(e)}>i</button>
      {link
        ? <a className="sf-callbtn" href={e.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${e.name}`}>Open</a>
        : <a className="sf-callbtn" href={telHref(e.phone!, abroad)} aria-label={`Call ${e.name}, ${dialNumber(e.phone!, abroad)}`}>Call</a>}
    </li>
  )
}

/** One local set (by location), then national, OFW and teleconsult (PART-3 4.1). */
function QuickDial({ place }: { place: Place }) {
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const [info, setInfo] = useState<Entry | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let live = true
    const check = () => void getMember().then((m) => live && setAdmin(m?.role === 'admin')).catch(() => undefined)
    check()
    const off = onAuthChange(check)
    return () => { live = false; off() }
  }, [])
  const plan = planDial(place.weather, withFamilyAdded(hotlines as Entry[], overrides), place.source !== 'zone')
  return (
    <div className="sf">
      {plan.note && <p className="sf-note" role="status">{plan.note}</p>}
      {plan.where === 'ph' && admin && <p className="sub" style={{ margin: '0 4px' }}>No local numbers yet. <a href="#admin">Add them</a></p>}
      {plan.sets.map((set) => {
        const { groups, missing } = splitDial(set.entries)
        const items = groups.flatMap((g) => g.items)
        const links = set.entries.filter(isLink)
        return (
          <section key={set.id} aria-label={set.header}>
            <h2 className="sec">{set.header}</h2>
            {!items.length && !links.length && !missing.length && <p className="sub" style={{ margin: '0 4px' }}>{admin ? <>No local numbers yet. <a href="#admin">Add them</a></> : 'No local numbers yet. Ask an admin to add them.'}</p>}
            <ul className="sf-dial-list">
              {[...items, ...links].map((e) => <DialRow key={e.id} e={e} onInfo={setInfo} abroad={plan.abroad} />)}
              {missing.map((e) => (
                <li key={e.id} className="sf-dialrow sf-dialrow-add">
                  <span className="sf-dt"><b>{e.name}</b><span className="sub">Not confirmed yet</span></span>
                  <button type="button" className="sf-i" aria-label={`Where ${e.name} came from`} onClick={() => setInfo(e)}>i</button>
                  <button type="button" className="btn2 sf-addbtn" aria-label={`Add number for ${e.name}`} onClick={() => setEditing(editing === e.id ? null : e.id)}>Add</button>
                  {editing === e.id && <div className="sf-dial-edit"><EditForm entry={e} geo={false} onDone={() => setEditing(null)} /></div>}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {plan.abroad && (
        <section aria-label="Local emergency number">
          <h2 className="sec">Emergency number where you are</h2>
          <p className="sub" style={{ margin: '0 4px' }}>We do not have a list for this country, so we will not guess a number. Check an official source before you travel.</p>
          <a className="btn2 sf-ico" href={ABROAD_SOURCE.url} target="_blank" rel="noopener noreferrer">{ABROAD_SOURCE.label}</a>
        </section>
      )}
      {info && <InfoSheet title={info.name} onClose={() => setInfo(null)}><SourceInfo e={info} /></InfoSheet>}
    </div>
  )
}

const SOURCES: [string, string, string][] = [
  ['NDRRMC, PAGASA, PHIVOLCS, DOH, Philippine Red Cross', 'Plain-word safety cards and warnings', 'https://www.pagasa.dost.gov.ph/'],
  ['Ready.gov and WHO', 'Safety card wording (written in our own words)', 'https://www.ready.gov/'],
  ['HazardHunterPH', 'Hazard readings for Dampas', 'https://hazardhunter.georisk.gov.ph/'],
  ['Windy, Ventusky, PAGASA Panahon', 'Weather and storm maps', 'https://www.windy.com/'],
  ['PAGASA public alerts (CC BY 4.0)', 'Wind signals and flood advisories, read from the PAGASA public alert feed', 'https://publicalert.pagasa.dost.gov.ph/'],
  ['GDACS', 'Storm and quake alerts', 'https://www.gdacs.org/'],
  ['OpenStreetMap contributors', 'Map data (ODbL)', 'https://www.openstreetmap.org/copyright']
]

/** In-app list of where Safety information comes from. Each phone number also shows its own source behind the i button on Quick dial. */
function Sources() {
  return (
    <div className="sf">
      <p className="sub" style={{ margin: '0 4px' }}>Bantay is not an earthquake or tsunami siren. Cards are written in plain words from these sources. Posters are drawn for Bantay.</p>
      <ul className="sf-src-list">
        {SOURCES.map(([name, what, url]) => (
          <li key={name} className="grp row"><span className="grow"><b>{name}</b><span className="sub">{what}. <a href={url} target="_blank" rel="noopener noreferrer">Open</a></span></span></li>
        ))}
      </ul>
      <p className="sub" style={{ margin: '0 4px' }}>Phone numbers: tap the i button next to a number on <a href="#safety/dial">Quick dial</a> to see where it came from and when it was read. A number marked check is not yet confirmed.</p>
    </div>
  )
}

function PastSos() {
  const raw = useKv<unknown[]>(HISTORY_KEY, [])
  return Array.isArray(raw) && raw.length ? <SosHistory /> : <p className="sf-empty" role="status">No SOS sent from this phone yet.</p>
}

function Body({ sub, l, place }: { sub: Sub; l: Loc; place: Place }) {
  switch (sub) {
    case 'warnings': return <Warnings place={place} />
    case 'weather':
      return (
        <>
          <a className="btn2 sf-ico" href="#weather">See the forecast</a>
          <LiveMapToggle loc={place.weather} more={<section aria-labelledby="s-map"><h2 id="s-map" className="hd">Live maps</h2><MapsPanel loc={place.source !== 'zone' ? place.weather : null} ask={l.ask} zone={place.zone} /></section>} />
        </>
      )
    case 'storms': return <StormTracker place={place} />
    case 'map': {
      // Our places are listed per home area. Away from that area (another city, abroad) we show no list rather than a far one.
      if (!coversHere(place)) return <p className="sf-empty" role="status">Nearest hospitals: ask your barangay or call 911. We have no verified list for where you are yet.</p>
      return (
        <>
          <RescueMap lat={place.weather.lat} lon={place.weather.lon} zoneName={HOME_ZONES.find((z) => z.id === place.zone)?.name} />
          <section aria-labelledby="s-evac"><h2 id="s-evac" className="hd">Evacuation and rescue</h2><EntryList seed={places as Entry[]} geo zone={place.zone} /></section>
        </>
      )
    }
    case 'dial': return <QuickDial place={place} />
    case 'hazards': return <HazardPage place={place} />
    case 'cards': return <Practice />
    case 'sos': return <PastSos />
    case 'sources': return <Sources />
    case 'phonewarn': return <PhoneAlertsPage />
    case 'firstaid': return <FirstAidList />
    case 'world': return <World />
    case 'offline': return <OfflineMaps />
    case 'alerts': return <AlertSettings />
  }
}

/** A Safety sub-page: back button, title, the place chip, then the page. */
export default function SafetySub({ sub, l, place }: { sub: Sub; l: Loc; place: Place | null }) {
  useEffect(() => { document.querySelector('main.scroll')?.scrollTo?.(0, 0) }, [sub])
  return (
    <>
      {sub !== 'world' && <LargeTitle title={TITLES[sub]} back={{ href: '#safety', label: 'Safety' }} actions={<ZonePicker loc={l} />} />}
      {place && <Body sub={sub} l={l} place={place} />}
    </>
  )
}
