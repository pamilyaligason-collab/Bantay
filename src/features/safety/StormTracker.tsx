import { useState } from 'react'
import { HOME_ZONES, type LatLon } from '../location/geo'
import { GroupedList, Row, Section, Segmented } from '../look'
import { Icon } from '../shell/Icon'
import { ALL_IDS } from '../gobag/items'
import { KEY as BAG_KEY, EMPTY as BAG_EMPTY, readState } from '../gobag/state'
import { dialCount } from './SafetyHub'
import { OVERRIDES_KEY, type Overrides } from './entries'
import { ALERTS_KEY, freshness, freshText, newestChecked, type Alert } from './alerts'
import LazyMap from './LazyMap'
import { cyclones, stormLine, stormName, since, windySrc, WINDY_LAYERS, type WindyLayer } from './LiveMaps'
import { NONE_A, type Place, useOnline } from './SafetyPages'
import { StormBlock } from './StormCard'
import { liveSignals } from './stormMode'
import { PAR, pauseOnData, type Conn } from './stormPar'
import { stormCentre, zoomEarthUrl } from './stormView'
import { putKv, useKv } from './store'
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

/** An outside link drawn like a Row (Row has no target option). */
function ExtRow({ title, url }: { title: string; url: string }) {
  return (
    <div className="rw" role="listitem">
      <a className="rw-main press" href={url} target="_blank" rel="noopener noreferrer">
        <span className="rw-lead rw-ic" data-tint="blue"><Icon name="out" size={20} /></span>
        <span className="rw-txt"><b className="rw-title">{title}</b><span className="rw-sub">Opens in a new tab.</span></span>
      </a>
    </div>
  )
}

export default function StormTracker({ place }: { place: Place }) {
  const online = useOnline()
  const all = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const pref = useKv<boolean>(PAUSE_KEY, true)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const packed = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY)).done.length
  const storms = cyclones(all)
  const zone = HOME_ZONES.find((z) => z.id === place.zone)
  const name = (zone?.name ?? 'your place').split(',')[0]!
  const view = stormCentre(place.weather)
  const line = stormLine(storms, place.weather, name)
  const [layer, setLayer] = useState<WindyLayer>('wind')
  const [loaded, setLoaded] = useState(false)
  const paused = pauseOnData((navigator as Navigator & { connection?: Conn }).connection, pref)
  const showFrame = online && (!paused || loaded)
  const pinned = storms.filter((s): s is Alert & { lat: number; lon: number } => s.lat != null && s.lon != null)
  return (
    <div className="st">
      <section className="card st-hero" data-testid="storm-hero" aria-label="Storm status">
        <div role="status">
          <div className="st-head"><span className="st-dot" data-on={storms.length ? 'watch' : 'calm'} aria-hidden="true" /><h2 className="st-status">{storms.length ? `${storms.length} ${storms.length === 1 ? 'storm' : 'storms'} listed` : 'No storms now'}</h2></div>
          <p className={`st-line sf-storm-line ${line.tone}`}>{line.text}</p>
        </div>
      </section>
      <LazyMap height={220} center={[place.weather.lat, place.weather.lon]} zoom={5} depKey={`par|${place.weather.lat}|${place.weather.lon}|${pinned.map((s) => s.id).join(',')}`}
        label="Map of the Philippine Area of Responsibility" testId="storm-map" recentre recentreLabel="Centre map on my location"
        setup={(L, m) => {
          const ring = L.polygon(PAR.map((p) => [p[0], p[1]] as [number, number]), { className: 'lm-par', interactive: false }).addTo(m)
          L.circleMarker([place.weather.lat, place.weather.lon], { radius: 8, className: 'lm-me', interactive: false }).addTo(m)
          for (const s of pinned) L.circleMarker([s.lat, s.lon], { radius: 9, className: 'lm-storm', interactive: false }).addTo(m)
          m.fitBounds(ring.getBounds(), { padding: [8, 8] })
        }} />
      <p className="st-note">PAR (Philippine Area of Responsibility), approx.</p>
      {storms.length > 0 && (
        <GroupedList icons label="Storms listed">
          {storms.map((a) => <Row key={a.id} icon="typhoon" tint="red" title={stormName(a)} sub={`${a.level ? `${a.level} alert` : 'Level unknown'} · since ${since(a.issuedAt)}`} />)}
        </GroupedList>
      )}
      {liveSignals(all).length > 0 && <StormBlock />}
      <section className="card st-windy" aria-label="Live weather layer">
        <Segmented label="Weather layer" value={layer} onChange={setLayer} options={LAYERS.map(([label, id]) => ({ id, label }))} />
        <div className="lm-box">
          {!online ? <p className="sf-empty lm-off" role="status">Maps need internet</p>
            : showFrame ? <iframe className="sf-frame" title={`Windy ${layer} map around your place`} src={windySrc(layer, view.lat, view.lon, view.zoom)} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
            : <div className="st-paused"><p className="sub">Paused to save mobile data.</p><button type="button" className="btn2" onClick={() => setLoaded(true)}>Load live layer</button></div>}
        </div>
        <p className="st-note">Live · Windy</p>
        <GroupedList label="Windy options">
          <Row title="Pause live layer on mobile data" sub="Phones that cannot report their connection always load it." control={
            <button type="button" role="switch" aria-checked={pref} aria-label="Pause live layer on mobile data" className="st-sw" onClick={() => void putKv(PAUSE_KEY, !pref)}><span /></button>
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
      <p className="st-note">GDACS, PAGASA · {freshText(freshness(newestChecked(all))).toLowerCase()} · Bantay is not a siren</p>
    </div>
  )
}
