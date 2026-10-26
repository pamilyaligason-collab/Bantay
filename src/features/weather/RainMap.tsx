import { useState } from 'react'
import type { LatLon } from '../location/geo'
import type { Alert } from '../safety/alerts'
import { Icon } from '../shell/Icon'
import { savedLine, type Forecast } from './forecast'
import { PAGASA_RADAR_HREF, rainBars, rainMode } from './rainBars'
import StormTrack from './StormTrack'

type Layer = 'rain' | 'wind' | 'storm'
const LAYERS: [Layer, string][] = [['rain', 'Rain'], ['wind', 'Wind'], ['storm', 'Storm track']]
const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }

/** The Weather screen's rain card. Chips Rain / Wind / Storm track. Rain is the Open-Meteo hourly chance bars plus a PAGASA radar link until RainViewer coverage of the
 *  Philippines is confirmed (rainBars.ts, M1); nothing loads from a map provider. Everything shown comes from the saved forecast, so it works offline. */
export default function RainMap({ fc, point, placeName, alerts }: { fc: Forecast; point: LatLon; placeName: string; alerts: Alert[] }) {
  const [layer, setLayer] = useState<Layer>('rain')
  const bars = rainBars(fc, 12)
  const c = fc.current
  return (
    <section aria-label="Rain and storm map" className="card wx-rain">
      <div className="wx-sech"><h2 className="wx-h">Rain map</h2><span className="wx-sub"><Icon name="dl" size={16} /> {savedLine(fc)}</span></div>
      <div className="wx-seg" role="group" aria-label="Map layer">
        {LAYERS.map(([id, label]) => <button key={id} type="button" aria-pressed={layer === id} onClick={() => setLayer(id)}>{label}</button>)}
      </div>
      {layer === 'rain' && (rainMode() === 'bars' ? (
        <>
          {bars.length === 0 ? <p className="wx-note">No hourly rain data is saved yet.</p> : (
            <ul className="wx-bars" aria-label="Chance of rain, next 12 hours">
              {bars.map((b, i) => (
                <li key={b.time} data-level={b.level}>
                  <i style={{ height: `${Math.max(4, b.pct ?? 0)}%` }} />
                  <b>{b.pct == null ? '–' : `${Math.round(b.pct)}%`}</b>
                  <span>{i === 0 ? 'Now' : hourLabel(b.time)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="wx-sub">Chance of rain each hour at {placeName}, from Open-Meteo. For the live radar picture, open PAGASA.</p>
          <a className="pill ghost block" href={PAGASA_RADAR_HREF} target="_blank" rel="noopener noreferrer">Radar images from PAGASA <Icon name="out" size={18} /></a>
        </>
      ) : null)}
      {layer === 'wind' && (
        <p className="wx-note" role="status">
          Wind now {c.wind == null ? 'is not known' : `${Math.round(c.wind)} km/h`}{c.gust != null && `, gusts to ${Math.round(c.gust)} km/h`} at {placeName}. For the wind map, use Open live map below.
        </p>
      )}
      {layer === 'storm' && <StormTrack alerts={alerts} point={point} placeName={placeName} />}
    </section>
  )
}
