import type { ReactNode } from 'react'
import { Row, type Hue } from '../../look'
import type { IconName } from '../../shell/Icon'
import { seasonFor, type Season } from './season'
import '../../weather/scene.css' // wxs-rain streaks, reused by the rainy-season row
import '../discover.css'

const SEASON_LOOK: Record<string, { hue: Hue; icon: IconName }> = {
  undas: { hue: 'terra', icon: 'flame' },
  newyear: { hue: 'lilac', icon: 'flame' },
  christmas: { hue: 'green', icon: 'meal' },
  heat: { hue: 'terra', icon: 'sun' },
  typhoon: { hue: 'blue', icon: 'rain' }
}
const STREAKS = [8, 24, 41, 58, 74, 90]

/** Decorative layer behind the season row: rainy season = 6 slow rain streaks, Undas = a candle glow. Both stop under reduced motion (scene.css and discover.css). */
function SeasonBg({ id }: { id: string }) {
  let inner: ReactNode = null
  if (id === 'typhoon') inner = <div className="wxs-rain">{STREAKS.map((x, i) => <i key={x} style={{ left: `${x}%`, animationDelay: `${-i * 0.7}s`, animationDuration: '2.4s' }} />)}</div>
  return <div className="dc-sea-bg" data-s={id} aria-hidden="true">{inner}</div>
}

/** What matters this time of year, as one row that opens the season page (#discover/season). Nothing renders outside a season. */
export function SeasonRow({ now = new Date() }: { now?: Date }) {
  const s = seasonFor(now)
  if (!s) return null
  const look = SEASON_LOOK[s.id] ?? { hue: 'amber' as Hue, icon: 'info' as IconName }
  return (
    <div className="card dc-season-row" data-hue={look.hue} data-testid="season-row">
      <SeasonBg id={s.id} />
      <Row icon={look.icon} title={s.title} sub={s.lines[0]} href="#discover/season" />
    </div>
  )
}

/** The season page: 2 or 3 short lines and one link to the screen that helps. */
export function SeasonCard({ now = new Date(), season }: { now?: Date; season?: Season | null }) {
  const s = season === undefined ? seasonFor(now) : season
  if (!s) return null
  return (
    <section className="card dc-season" aria-label={s.title} data-testid="season">
      <b className="sh-h2">{s.title}</b>
      <ul className="dc-lines">{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <span className="dc-row">
        <a className="btn2 dc-go" href={s.link.href}>{s.link.label}</a>
        <a className="dc-src" href={s.source.url} target="_blank" rel="noopener noreferrer">Source: {s.source.name}</a>
      </span>
    </section>
  )
}
