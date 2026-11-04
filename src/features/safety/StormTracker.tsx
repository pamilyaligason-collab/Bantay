import { useState } from 'react'
import { type LatLon } from '../location/geo'
import { alertRef } from '../location/place'
import { GroupedList, Row, Section, Segmented } from '../look'
import { ExtRow } from './ExtRow'
import { ALL_IDS } from '../gobag/items'
import { KEY as BAG_KEY, EMPTY as BAG_EMPTY, readState } from '../gobag/state'
import { dialCount } from './SafetyHub'
import { OVERRIDES_KEY, type Overrides } from './entries'
import { ALERTS_KEY, CHECKED_KEY, LAST_SEEN_KEY, NO_STALE, STALE_KEY, feedStale, freshness, freshText, shownCheck, type Alert, type StaleSources } from './alerts'
import LazyMap from './LazyMap'
import { cyclones, stormLine, stormName, since, windySrc, WINDY_LAYERS, type WindyLayer } from './LiveMaps'
import { NONE_A, type Place, useOnline } from './SafetyPages'
import { StormBlock } from './StormCard'
import { liveSignals } from './stormMode'
import { PAR, pauseOnData, type Conn } from './stormPar'
import { stormCentre, zoomEarthUrl } from './stormView'
import { putKv, useKv } from './store'
import { placeName } from './warningsLogic'
import './livemaps.css'
import './safety.css'
import './storm.css'

const PAUSE_KEY = 'safety.windyPause'
const NONE_O: Overrides = {}
const LAYERS = WINDY_LAYERS.filter(([, id]) => id !== 'temp')

const stormLinks = (loc: LatLon) => [
  ['PAGASA tropical cyclone bulletin', 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'],
  ['JTWC', 'https://www.metoc.navy.mil/jtwc/jtwc.html'],
  ['Zoom Earth', zoomEarthUrl(loc)]
]

/** The newest cyclone row we hold, listed or not: the "Last storm" line when none is listed now. */
export const lastStorm = (all: Alert[]): Alert | null =>
  all.filter((a) => a.kind === 'gdacs' && a.id.startsWith('gdacs-TC-')).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0] ?? null

export default function StormTracker({ place }: { place: Place }) {
  const online = useOnline()
  const all = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const pref = useKv<boolean>(PAUSE_KEY, true)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const packed = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY)).done.length
  const storms = cyclones(all)
  const seen = useKv<Alert[]>(LAST_SEEN_KEY, NONE_A)
  const saved = useKv<unknown>(CHECKED_KEY, null)
  const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const checked = !feedStale(all, saved, down) // no storm is only said after a fresh check
  const name = placeName(place) // the line is measured from alertRef, the place this names (home for a phone abroad, never its foreign position)
  const signals = liveSignals(all)
  const view = stormCentre(place.weather)
  const line = stormLine(storms, alertRef(place), name, checked, signals.length)
  const [layer, setLayer] = useState<WindyLayer>('wind')
  const [loaded, setLoaded] = useState(false)
  const paused = pauseOnData((navigator as Navigator & { connection?: Conn }).connection, pref)
  const showFrame = online && (!paused || loaded)
  const last = storms.length ? null : lastStorm([...all, ...seen])
  const pinned = storms.filter((s): s is Alert & { lat: number; lon: number } => s.lat != null && s.lon != null)
  return (
    <div className="st">
      <section className="card st-hero" data-testid="storm-hero" aria-label="Storm status">
        <div role="status">
          <div className="st-head"><span className="st-dot" data-on={storms.length || signals.length || !checked ? 'watch' : 'calm'} aria-hidden="true" /><h2 className="st-status">{storms.length ? `${storms.length} ${storms.length === 1 ? 'storm' : 'storms'} listed` : signals.length ? `${signals[0]!.level} in force` : checked ? 'No storm near the Philippines now' : 'Storms not checked lately'}</h2></div>
          <p className={`st-line sf-storm-line ${line.tone}`}>{line.text}</p>
        </div>
        <LazyMap height={240} center={[place.weather.lat, place.weather.lon]} zoom={5} depKey={`par|${place.weather.lat}|${place.weather.lon}|${pinned.map((s) => s.id).join(',')}`}
          label="Map of the Philippine Area of Responsibility" testId="st-map" recentre recentreLabel="Centre map on my location"
          overlay={<Segmented label="Weather layer" value={layer} onChange={setLayer} options={LAYERS.map(([label, id]) => ({ id, label }))} />}
          setup={(L, m) => {
            const ring = L.polygon(PAR.map((p) => [p[0], p[1]] as [number, number]), { className: 'lm-par', interactive: false }).addTo(m)
            L.circleMarker([place.weather.lat, place.weather.lon], { radius: 8, className: 'lm-me', interactive: false }).addTo(m)
            for (const s of pinned) L.circleMarker([s.lat, s.lon], { radius: 9, className: 'lm-storm', interactive: false }).addTo(m)
            m.fitBounds(ring.getBounds(), { padding: [8, 8] })
            const par = new (L.Control.extend({ onAdd: () => { const d = L.DomUtil.create('div', 'st-par'); d.textContent = 'PAR (Philippine Area of Responsibility), approx.'; return d } }))({ position: 'bottomleft' })
            par.addTo(m) // the board puts the PAR label on the map
          }} />
      </section>
      {storms.length > 0 && (
        <GroupedList icons label="Storms listed">
          {storms.map((a) => <Row key={a.id} icon="typhoon" tint="red" title={stormName(a)} sub={`${a.level ? `${a.level} alert` : 'Level unknown'} · since ${since(a.issuedAt)}`} />)}
        </GroupedList>
      )}
      {last && (
        <GroupedList icons label="Last storm">
          <Row testId="st-last" icon="typhoon" tint="blue" title="Last storm" sub={`${stormName(last)} · started ${since(last.issuedAt)}`} />
        </GroupedList>
      )}
      {signals.length > 0 && <StormBlock />}
      <section className="card st-windy" aria-label="Live weather layer">
        <div className="lm-box">
          {!online ? <p className="sf-empty lm-off" role="status">Maps need internet</p>
            : showFrame ? <iframe className="sf-frame" title={`Windy ${layer} map around your place`} src={windySrc(layer, view.lat, view.lon, view.zoom)} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
            : <div className="st-paused"><p className="sub">Paused to save mobile data.</p><button type="button" className="btn2" onClick={() => setLoaded(true)}>Load live layer</button></div>}
        </div>
        <p className="st-note">Live · Windy</p>
        <GroupedList label="Windy options">
          <Row title="Pause on mobile data" sub="Phones that cannot report their connection always load it." control={
            <button type="button" role="switch" aria-checked={pref} aria-label="Pause on mobile data" className="st-sw" onClick={() => void putKv(PAUSE_KEY, !pref)}><span /></button>
          } />
        </GroupedList>
      </section>
      <Section title="Get ready">
        <GroupedList icons label="Get ready">
          <Row icon="bag" tint="green" title="Go-bag" value={`${packed} of ${ALL_IDS.length}`} href="#gobag" />
          <Row icon="phone" tint="red" title="Hotlines" value={`${dialCount(place, overrides)} numbers`} href="#safety/dial" />
        </GroupedList>
      </Section>
      <Section title="Official">
        <GroupedList icons label="Official">
          {stormLinks(place.weather).map(([title, url]) => <ExtRow key={url} title={title} url={url} />)}
        </GroupedList>
      </Section>
      <p className="st-note">GDACS, PAGASA · {freshText(freshness(shownCheck(all, saved, down))).toLowerCase()} · Bantay is not a siren</p>
    </div>
  )
}
