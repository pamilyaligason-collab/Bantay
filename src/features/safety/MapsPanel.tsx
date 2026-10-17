import { useState } from 'react'
import { HOME, type LatLon } from './alerts'
import Lazy from './Lazy'
import './safety.css'

// Only a rounded location (about 1 km) goes to map hosts.
const r2 = (n: number) => n.toFixed(2)

// ponytail: layer ids are the Ventusky ones; if a layer shows blank, check the id in the Ventusky address bar.
export const LAYERS = [
  ['Rain', 'rain-3h'],
  ['Wind', 'wind-10m'],
  ['Temp', 'temperature-2m'],
  ['Clouds', 'clouds-total']
] as const

export const ventuskyUrl = (c: LatLon, layer: string, zoom = 7) =>
  `https://embed.ventusky.com/?p=${r2(c.lat)};${r2(c.lon)};${zoom}&l=${layer}&w=soft&pin=${r2(HOME.lat)};${r2(HOME.lon)};dot;Home`

const windyUrl = (c: LatLon) =>
  `https://embed.windy.com/embed2.html?lat=${r2(c.lat)}&lon=${r2(c.lon)}&detailLat=${r2(c.lat)}&detailLon=${r2(c.lon)}&zoom=7&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=true&calendar=now&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-forms'

export function Frame({ title, src }: { title: string; src: string }) {
  return <iframe className="sf-frame" title={title} src={src} loading="lazy" referrerPolicy="no-referrer" sandbox={SANDBOX} />
}

const LINKS = [
  ['Project NOAH', 'Flood, landslide and storm surge maps. Opens in a new tab.', 'https://noah.up.edu.ph/'],
  ['World view', 'Global hazards on worldmonitor.app. Opens in a new tab.', 'https://worldmonitor.app/'],
  ['JMA typhoon map', 'Japan Meteorological Agency typhoon tracks. Opens in a new tab.', 'https://www.jma.go.jp/bosai/map.html']
]

export default function MapsPanel({ loc = null }: { loc?: LatLon | null }) {
  const [layer, setLayer] = useState<string>(LAYERS[0][1])
  const c = loc ?? HOME
  return (
    <div className="sf">
      <div role="group" aria-label="Map layer" className="sf-chips">
        {LAYERS.map(([label, id]) => (
          <button key={id} className="pill" aria-pressed={layer === id} onClick={() => setLayer(id)} style={{ background: layer === id ? 'var(--btn)' : 'var(--fill)', color: layer === id ? 'var(--btn-fg)' : 'var(--ink)' }}>{label}</button>
        ))}
      </div>
      <Lazy summary="Ventusky weather map"><Frame title="Ventusky weather map centred on your area" src={ventuskyUrl(c, layer)} /></Lazy>
      <Lazy summary="Windy rain and wind"><Frame title="Windy rain and wind map" src={windyUrl(c)} /></Lazy>
      <Lazy summary="HazardHunterPH hazards at an address"><Frame title="HazardHunterPH hazard maps" src="https://hazardhunter.georisk.gov.ph/" /></Lazy>
      <Lazy summary="PAGASA forecasts and warnings"><Frame title="PAGASA Panahon forecasts" src="https://www.panahon.gov.ph/" /></Lazy>
      <div className="grp">
        {LINKS.map(([name, use, url]) => (
          <a key={url} className="row" href={url} target="_blank" rel="noopener noreferrer">
            <span className="grow"><span>{name}</span><span className="sub" style={{ fontSize: 14 }}>{use}</span></span>
          </a>
        ))}
      </div>
      <p className="sf-empty">Maps need a signal. Everything else on this screen works without one.</p>
    </div>
  )
}
