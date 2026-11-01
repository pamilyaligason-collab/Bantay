import { useState } from 'react'
import { alertRef } from '../location/place'
import { HOME_ZONES, pickLocalSet } from '../location/geo'
import { GroupedList, Row, Section } from '../look'
import { Icon } from '../shell/Icon'
import { ALERTS_KEY, NOT_A_SIREN, CHECKED_KEY, distanceKm, freshness, lastCheck, outdatedLine, quakeMag, rankAlerts, type Alert } from './alerts'
import { FLAGS } from './flags'
import LazyMap from './LazyMap'
import NewsTop5 from './NewsTop5'
import PhoneWarnings from './PhoneWarnings'
import SafetyBrief from './SafetyBrief'
import { NONE_A, type Place } from './SafetyPages'
import { signalOf, WARNINGS_FALLBACK, WARNINGS_SOURCE_LINE } from './stormMode'
import { useKv } from './store'
import { agoText, feltLine, sourceRows } from './warningsLogic'
import './safety.css'
import './warnings.css'

/** The hub zone id news is tagged with, or null outside every area. */
const newsZone = (place: Place) => { const p = pickLocalSet(place.weather); return p.where === 'area' ? p.area.id : null }

const KIND: Record<Alert['kind'], string> = {
  tcws: 'Typhoon signal', rainfall: 'Rainfall', thunderstorm: 'Thunderstorm', heat: 'Heat', quake: 'Earthquake', tsunami: 'Tsunami',
  utility: 'Utility', local: 'Local notice', gdacs: 'World event', volcano: 'Volcano', air: 'Air quality'
}
const SHAKE = 'Drop, cover and hold on. Stay away from windows. If you are on the coast and the ground shakes hard, go to high ground at once.'

function ShakeRow({ steps }: { steps: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div role="listitem">
      <div className="rw">
        <button type="button" className="rw-main press wn-shake" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="rw-lead rw-ic" data-tint="amber"><Icon name="quake" size={20} /></span>
          <span className="rw-txt"><b className="rw-title">If you ever feel shaking</b><span className="rw-sub">Drop, cover, hold. Tap for the steps.</span></span>
          <span className="rw-chev"><Icon name="chev" size={20} /></span>
        </button>
      </div>
      {open && <div className="wn-steps"><p>{steps}</p><p>{NOT_A_SIREN}</p></div>}
    </div>
  )
}

export default function Warnings({ place }: { place: Place }) {
  const all = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const here = alertRef(place)
  const now = Date.now()
  const top = rankAlerts(all, here)[0]
  const zone = HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]
  const name = zone.name.split(',')[0]!
  const mag = top?.kind === 'quake' ? quakeMag(top) : null
  const red = !!top && (top.kind === 'tsunami' || (top.kind === 'tcws' && (signalOf(top) ?? 0) >= 3))
  const point = top && top.lat != null && top.lon != null ? ([top.lat, top.lon] as [number, number]) : null
  const km = point ? Math.round(distanceKm(here, { lat: point[0], lon: point[1] })) : null // from where you are, not the nearer home zone
  const checked = lastCheck(all, useKv<unknown>(CHECKED_KEY, null))
  const stale = freshness(checked, now).tone !== 'ok'
  return (
    <div className="wn">
      {stale && <p className="sf-note" role="status">{outdatedLine(checked)}</p>}
      {top ? (
        <section className="wn-hero" data-testid="warn-hero" data-tone={red ? 'red' : 'amber'} aria-label="Top warning">
          <div className="wn-hero-top"><span className="wn-kind">{KIND[top.kind].toUpperCase()}</span><span className="wn-ago">{top.source} · {agoText(top.issuedAt, now)}</span></div>
          <div className="wn-big">
            <span className="wn-mag">{mag !== null ? `M${mag}` : top.level ?? top.title}</span>
            <span className="wn-felt">{feltLine(top, here, name)}</span>
          </div>
          {top.where && <div className="wn-where">{top.where}</div>}
          {km !== null && <div className="wn-km">{km} km from you, in {name}</div>}
        </section>
      ) : <p className="wn-empty" role="status" data-testid="warn-hero">{stale ? `No warnings on this phone. Last check: ${checked ? agoText(checked, now) : 'never'}.` : 'No active warnings for your area right now. Official bulletins always come first.'}</p>}
      {top && point && (
        <LazyMap height={180} center={point} zoom={6} depKey={`${top.id}|${here.lat}|${here.lon}`} label="Map of the warning and your place" testId="warn-map"
          setup={(L, m) => {
            const me: [number, number] = [here.lat, here.lon]
            L.polyline([me, point], { className: 'lm-line', interactive: false }).addTo(m)
            L.circleMarker(point, { radius: 8, className: 'lm-epi', interactive: false }).addTo(m)
            L.circleMarker(me, { radius: 8, className: 'lm-me', interactive: false }).addTo(m)
            m.fitBounds(L.latLngBounds([me, point]), { padding: [30, 30], maxZoom: 9 })
          }} />
      )}
      <GroupedList icons label="Shaking">
        <ShakeRow steps={(top?.kind === 'quake' && top.doNow) || SHAKE} />
      </GroupedList>
      <a className="btn2" href="#safety/cards">Safety cards</a>
      {top && <Section title="Official warnings now"><SafetyBrief loc={here} /></Section>}
      <Section title="Sources and freshness">
        <GroupedList icons label="Sources">
          {sourceRows(all, now, FLAGS.phivolcs).map((s) => (
            <Row key={s.title} icon={s.title === 'USGS' ? 'quake' : s.title === 'PAGASA' ? 'typhoon' : 'warn'} tint={s.live ? 'green' : 'amber'} title={s.title} sub={s.sub} badge={s.live ? 'Live' : 'Stale'} badgeTint={s.live ? 'green' : 'amber'} />
          ))}
          <Row icon="phone" tint="blue" title="Phone warnings" value="Carrier" href="#safety/phonewarn" />
        </GroupedList>
      </Section>
      <PhoneWarnings level={2} />
      <Section title="Safety news"><NewsTop5 zone={newsZone(place)} /></Section>
      <p className="wn-foot">{WARNINGS_SOURCE_LINE} <a href="https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin" target="_blank" rel="noopener noreferrer">Open the PAGASA bulletin</a></p>
      <details className="wn-foot"><summary>If a source is down</summary>{WARNINGS_FALLBACK}</details>
    </div>
  )
}
