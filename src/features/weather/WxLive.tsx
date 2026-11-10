import { useState } from 'react'
import type { LatLon } from '../location/geo'
import { CHECKED_KEY, NO_STALE, STALE_KEY, feedStale, freshText, freshness, neverChecked, shownCheck, type Alert, type StaleSources } from '../safety/alerts'
import { WINDY_LAYERS, WindyMap, cyclones, since, stormLine, stormName, useOnline, windySrc, type WindyLayer } from '../safety/LiveMaps'
import { liveSignals } from '../safety/stormMode'
import { pauseOnData, type Conn } from '../safety/stormPar'
import { putKv, useKv } from '../safety/store'
import { Icon } from '../shell/Icon'
import { pickStorm } from '../today/stormView'
import { stormFrame } from './stormFrame'
import '../safety/safety.css'
import '../safety/storm.css'
import '../safety/livemaps.css'

export const WX_PAUSE_KEY = 'wx.windyPause' // its own switch, default off (D-125); Storm tracker keeps safety.windyPause
const BULLETIN = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'

/** One pause state for both Windy frames: a tap on "Load live layer" loads both. */
export function useWxPause() {
  const pref = useKv<boolean>(WX_PAUSE_KEY, false)
  const [loaded, setLoaded] = useState(false)
  const paused = pauseOnData((navigator as Navigator & { connection?: Conn }).connection, pref) && !loaded
  return { pref, paused, load: () => setLoaded(true) }
}
type Pause = ReturnType<typeof useWxPause>

/** The credit under a map. An iframe fires load on an error page too, so "Live" cannot be proved and is not said: the same plain credit in every state. */
const Credit = () => <p className="sub lm-credit wx-credit">Map by Windy</p>
/** The calm card's one line (A-P3): said only after a fresh check with no storm and no wind signal; every other state keeps stormLine's own sentence, so "no storms" is never said without a check. */
export const CALM_LINE = 'No storm warnings for the Philippines right now.'
export function calmLine(storms: Alert[], from: LatLon, place: string, checked: boolean, signals: number, never = false): ReturnType<typeof stormLine> {
  return checked && !storms.length && !signals ? { text: CALM_LINE, tone: 'calm' } : stormLine(storms, from, place, checked, signals, never)
}
export const GoRow = ({ href, children }: { href: string; children: string }) => <a className="wx-go" href={href}>{children} <Icon name="chev" size={16} /></a>

/** Under the hero: the live Windy map centred on the forecast point. Switching a layer changes the one frame's src, so frames never stack. The chips stay above the frame because a chip laid over an iframe would swallow the taps meant for the map (board S21Weather draws them on it). */
export function LiveMapCard({ point, pause }: { point: LatLon; pause: Pause }) {
  const [layer, setLayer] = useState<WindyLayer>('rain')
  const online = useOnline()
  return (
    <section aria-label="Live weather map" className="card wx-map wx-bleed" data-testid="wx-live-map">
      <div role="group" aria-label="Weather layer" className="sf-chips wx-pad">
        {WINDY_LAYERS.map(([label, id]) => (
          <button key={id} type="button" className="pill" aria-pressed={layer === id} onClick={() => setLayer(id)}>{label}</button>
        ))}
      </div>
      <WindyMap title={`Windy ${layer} map for your place`} src={windySrc(layer, point.lat, point.lon)} online={online} pause={pause} />
      <div className="wx-pad">
      <Credit />
      <p className="sub">Forecast map, not radar. Needs internet.</p>
      <div className="wx-pause">
        <span className="wx-pause-t"><b>Pause on mobile data</b><span className="sub">Phones that cannot report their connection always load it.</span></span>
        <button type="button" role="switch" aria-checked={pause.pref} aria-label="Pause on mobile data" className="st-sw" onClick={() => void putKv(WX_PAUSE_KEY, !pause.pref)}><span /></button>
      </div>
      </div>
    </section>
  )
}

/** Shown only with an advisory (advisory.ts): the existing sentence, a wind map framed to hold the place and the nearest storm (stormFrame; Windy cannot draw a storm marker, so only the place pin shows), the storm rows, the links. */
export function StormsNear({ alerts, point, place, pause }: { alerts: Alert[]; point: LatLon; place: string; pause: Pause }) {
  const online = useOnline()
  const storms = cyclones(alerts)
  const saved = useKv<unknown>(CHECKED_KEY, null); const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const checked = !feedStale(alerts, saved, down)
  const line = stormLine(storms, point, place, checked, liveSignals(alerts).length, neverChecked(alerts, saved, down))
  const view = stormFrame(alerts, point)
  return (
    <section aria-label="Storm track" className="card wx-rain wx-bleed" data-testid="wx-storms-near">
      <div className="wx-storm" data-tone={line.tone}>
        <div className="wx-pad">
          <h2 className="wx-h"><i className="wx-dot" data-tone={line.tone} aria-hidden="true" />Storms near you</h2>
          <p className="wx-note" role="status"><b>{line.text}</b></p>
        </div>
        <WindyMap title={view.alone || !pickStorm(alerts, point) ? 'Windy wind map of your place' : 'Windy wind map framed on your place and the nearest storm'} src={windySrc('wind', view.lat, view.lon, view.zoom, point)} online={online} pause={pause} />
        <div className="wx-pad">
        <Credit />
        {view.alone && <p className="sub">The storm is too far to share this map with your place, so the map shows your place. The distance is in the sentence above.</p>}
        {storms.length > 0 && (
          <ul className="grp">
            {storms.map((s) => (
              <li key={s.id} className="row"><span className="grow"><b>{stormName(s)}</b><span className="sub">{s.level ? `${s.level} alert` : 'Level unknown'} · since {since(s.issuedAt)} · GDACS</span></span></li>
            ))}
          </ul>
        )}
        <GoRow href="#safety/storms">Open Storm tracker</GoRow>
        <a className="pill primary block" href={BULLETIN} target="_blank" rel="noopener noreferrer">PAGASA bulletin <Icon name="out" size={18} /></a>
        </div>
      </div>
    </section>
  )
}

/** No advisory: one line with a status dot and a Storm tracker link. stormLine says "not checked lately" ("yet" when never) for a stale feed, never an all-clear without a fresh check. */
export function StormLineCard({ alerts, point, place }: { alerts: Alert[]; point: LatLon; place: string }) {
  const saved = useKv<unknown>(CHECKED_KEY, null)
  const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const checkedAt = shownCheck(alerts, saved, down)
  const line = calmLine(cyclones(alerts), point, place, !feedStale(alerts, saved, down), liveSignals(alerts).length, neverChecked(alerts, saved, down))
  return (
    <section aria-label="Storm check" className="card wx-rain" data-testid="wx-storms-none">
      <p className="wx-note wx-calmline" role="status"><i className="wx-dot" data-tone={line.tone} aria-hidden="true" /><b>{line.text}</b></p>
      <p className="sub wx-checked">{freshText(freshness(checkedAt))}</p>
      <GoRow href="#safety/storms">Storm tracker</GoRow>
    </section>
  )
}
