import { useEffect, useRef, useState } from 'react'
import { useLocation, usePlaceFrom } from '../location/useLocation'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { stormName, windySrc } from '../safety/LiveMaps'
import { useKv } from '../safety/store'
import { awayText, mapView, pickStorm } from './stormView'

const PAGASA = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'
const NONE: Alert[] = []

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const f = () => setOn(navigator.onLine !== false)
    addEventListener('online', f); addEventListener('offline', f)
    return () => { removeEventListener('online', f); removeEventListener('offline', f) }
  }, [])
  return on
}

/** The iframe mounts only once the box is near the screen and the phone is online. */
function LazyMap({ title, src, online }: { title: string; src: string; online: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '200px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return (
    <div ref={ref} className="td-stormmap">
      {seen && (online
        ? <iframe className="sf-frame" title={title} src={src} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
        : <p className="td-sub" role="status">The map needs internet</p>)}
    </div>
  )
}

const updated = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? 'unknown' : new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Today storm card: shown only while GDACS lists an active cyclone with a position. */
export default function StormCard() {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const place = usePlaceFrom(useLocation())?.weather
  const online = useOnline()
  const from = place && Number.isFinite(place.lat) && Number.isFinite(place.lon) ? place : null
  const s = pickStorm(alerts, from)
  if (!s) return null
  const v = mapView(s, from)
  const away = awayText(from, s)
  return (
    <section aria-labelledby="t-storm" className="card td-storm">
      <h2 id="t-storm" className="td-sech">Storm near the Philippines</h2>
      <div className="td-grow">
        <strong>{stormName(s)}</strong>
        <span className="td-sub">{s.level ? `${s.level} alert` : 'Category unknown'}{away ? `, ${away}` : ''}</span>
        <span className="td-sub">Last update: {updated(s.checkedAt)}</span>
      </div>
      <LazyMap title="Windy wind map showing the storm and your place" src={windySrc('wind', v.lat, v.lon, v.zoom)} online={online} />
      <div className="td-row between">
        <a className="td-link" href="#safety/storms">Storm tracker</a>
        <a className="td-link" href={PAGASA} target="_blank" rel="noopener">PAGASA bulletin</a>
      </div>
    </section>
  )
}
