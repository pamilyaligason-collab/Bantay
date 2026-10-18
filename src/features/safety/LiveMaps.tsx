import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ALERTS_KEY, type Alert, type LatLon } from './alerts'
import { useKv } from './store'
import './livemaps.css'

export const WINDY_LAYERS = [['Rain', 'rain'], ['Wind', 'wind'], ['Temp', 'temp'], ['Clouds', 'clouds']] as const
export type WindyLayer = (typeof WINDY_LAYERS)[number][1]

// Only a rounded location (about 1 km) goes to the map host.
const r2 = (n: number) => n.toFixed(2)

export const windySrc = (layer: WindyLayer, lat: number, lon: number, zoom = 8) =>
  `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=${zoom}&overlay=${layer}&product=ecmwf&level=surface&lat=${r2(lat)}&lon=${r2(lon)}&detailLat=${r2(lat)}&detailLon=${r2(lon)}&marker=true`

export const STORM_VIEW = { lat: 12, lon: 128, zoom: 4 }

/** Active tropical cyclones from the GDACS rows the ingest keeps in safety.alerts (id gdacs-TC-<eventid>). Newest first. */
export function cyclones(alerts: Alert[]): Alert[] {
  return alerts.filter((a) => a.kind === 'gdacs' && a.id.startsWith('gdacs-TC-')).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
}

const stormName = (a: Alert) => a.where.split(',')[0].trim() || a.title
const updated = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 'time unknown' : new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const LINKS = [
  ['PAGASA bulletin', 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'],
  ['JTWC', 'https://www.metoc.navy.mil/jtwc/jtwc.html'],
  ['Zoom Earth', 'https://zoom.earth/maps/satellite/#view=12,128,5z'],
  ['World Monitor', 'https://www.worldmonitor.app/dashboard']
]

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const f = () => setOn(navigator.onLine !== false)
    addEventListener('online', f); addEventListener('offline', f)
    return () => { removeEventListener('online', f); removeEventListener('offline', f) }
  }, [])
  return on
}

/** Mounts children only once the box is near the screen, so a map never loads (or uses data) unseen. */
function NearView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '300px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return <div ref={ref} className="lm-box">{seen ? children : null}</div>
}

function WindyMap({ title, src, online }: { title: string; src: string; online: boolean }) {
  return (
    <NearView>
      {online
        ? <iframe className="sf-frame" title={title} src={src} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
        : <p className="sf-empty lm-off" role="status">Maps need internet</p>}
    </NearView>
  )
}

const NONE: Alert[] = []

export default function LiveMaps({ loc }: { loc: LatLon }) {
  const [layer, setLayer] = useState<WindyLayer>('rain')
  const online = useOnline()
  const storms = cyclones(useKv<Alert[]>(ALERTS_KEY, NONE))
  return (
    <div className="sf">
      <div role="group" aria-label="Weather layer" className="sf-chips">
        {WINDY_LAYERS.map(([label, id]) => (
          <button key={id} className="pill" aria-pressed={layer === id} onClick={() => setLayer(id)} style={{ background: layer === id ? 'var(--btn)' : 'var(--fill)', color: layer === id ? 'var(--btn-fg)' : 'var(--ink)' }}>{label}</button>
        ))}
      </div>
      <WindyMap title={`Windy ${layer} map for your place`} src={windySrc(layer, loc.lat, loc.lon)} online={online} />
      <p className="sub lm-credit">Map by Windy.com</p>
      <h3 className="hd lm-sub">Storms near the Philippines</h3>
      <WindyMap title="Windy wind map of the Western Pacific" src={windySrc('wind', STORM_VIEW.lat, STORM_VIEW.lon, STORM_VIEW.zoom)} online={online} />
      <p className="sub lm-credit">Map by Windy.com</p>
      {storms.length ? (
        <div className="grp">
          {storms.map((a) => (
            <div key={a.id} className="row"><span className="grow"><span>{stormName(a)}</span><span className="sub" style={{ fontSize: 14 }}>{a.level ?? 'Level unknown'} alert · updated {updated(a.issuedAt)}</span></span></div>
          ))}
        </div>
      ) : <p className="sf-empty" role="status">No active storms</p>}
      <div className="grp">
        {LINKS.map(([name, url]) => (
          <a key={url} className="row" href={url} target="_blank" rel="noopener">
            <span className="grow"><span>{name}</span><span className="sub" style={{ fontSize: 14 }}>Opens in a new tab.</span></span>
          </a>
        ))}
      </div>
    </div>
  )
}
