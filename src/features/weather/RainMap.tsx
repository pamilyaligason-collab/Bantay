import { Icon } from '../shell/Icon'
import { savedLine, type Forecast } from './forecast'
import { PAGASA_RADAR_HREF, rainBars, rainMode } from './rainBars'

const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }

/** The Weather screen's rain card (no layer chips). Rain is the Open-Meteo hourly chance bars plus a PAGASA radar link until RainViewer coverage of the
 *  Philippines is confirmed (rainBars.ts, M1); nothing loads from a map provider. Everything shown comes from the saved forecast, so it works offline. */
export default function RainMap({ fc, placeName, daily = null, nextRain = null }: { fc: Forecast; placeName: string; daily?: number | null; nextRain?: number | null }) {
  const bars = rainBars(fc, 12)
  return (
    <section aria-label="Rain chance" className="card wx-rain" data-testid="wx-rain">
      <div className="wx-sech"><h2 className="wx-h">Rain chance</h2><span className="wx-sub"><Icon name="dl" size={16} /> {savedLine(fc)}</span></div>
      <p className="wx-sub" data-testid="wx-rain-figures">{daily == null ? 'Today: no number yet' : `Today up to ${Math.round(daily)}%`}{nextRain != null && ` · Next 12 h ${Math.round(nextRain)}%`}</p>
      {(rainMode() === 'bars' ? (
        <>
          {bars.length === 0 ? <p className="wx-note">No hourly rain data is saved yet.</p> : (
            <ul className="wx-bars" aria-label="Chance of rain, next 12 hours">
              {bars.map((b, i) => (
                <li key={b.time} data-level={b.level}>
                  <em><i style={{ height: `${Math.max(4, b.pct ?? 0)}%` }} /></em>
                  <b data-show={i % 2 === 0 ? '1' : '0'}>{b.pct == null ? '–' : b.pct < 10 ? 'Low' : `${Math.round(b.pct)}%`}</b>
                  <span data-show={i % 3 === 0 ? '1' : '0'}>{i === 0 ? 'Now' : hourLabel(b.time)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="wx-sub">Chance of rain each hour at {placeName}. For the live radar picture, open PAGASA.</p>
          <a className="pill ghost block" href={PAGASA_RADAR_HREF} target="_blank" rel="noopener noreferrer">Radar images from PAGASA <Icon name="out" size={18} /></a>
        </>
      ) : null)}
    </section>
  )
}
