import { Row } from '../../look'
import type { IconName } from '../../shell/Icon'
import { seasonFor, type Season } from './season'
import '../discover.css'

const SEASON_ICON: Record<string, IconName> = { undas: 'flame', newyear: 'flame', christmas: 'meal', heat: 'sun', typhoon: 'rain' }

/** Decorative layer behind the season row: rainy season = a soft blue wash, Undas = a candle glow (flickers; stops under reduced motion). The old rain streaks fell 210 px inside a 72 px card and read as one lone glitch, so they are gone. */
function SeasonBg({ id }: { id: string }) {
  return <div className="dc-sea-bg" data-s={id} aria-hidden="true" />
}

/** What matters this time of year, as one row that opens the season page (#discover/season). Nothing renders outside a season. */
export function SeasonRow({ now = new Date() }: { now?: Date }) {
  const s = seasonFor(now)
  if (!s) return null
  return (
    <div className="card dc-season-row" data-testid="season-row">
      <SeasonBg id={s.id} />
      <Row icon={SEASON_ICON[s.id] ?? 'info'} tint="amber" title={s.title} sub={s.lines[0]} href="#discover/season" />
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
