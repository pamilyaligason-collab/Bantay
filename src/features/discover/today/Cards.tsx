import { Icon } from '../../shell/Icon'
import { pickOfDay, pickView } from './pick'
import { seasonFor } from './season'
import { dayKey } from '../play/score'

/** Today's pick: one item per local day, above the sub-nav. A video leaves the app (new tab, or the in-app browser on the phone). */
export function PickCard({ now = new Date() }: { now?: Date }) {
  const v = pickView(pickOfDay(dayKey(now)))
  return (
    <a className="card press dc-pick" href={v.href} {...(v.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} data-testid="pick">
      <span className="dc-grow">
        <span className="dc-eyebrow">Today's pick · {v.eyebrow}</span>
        <b className="dc-pick-t">{v.title}</b>
        <span className="sub">{v.sub}</span>
      </span>
      <Icon name={v.external ? 'out' : 'chev'} />
    </a>
  )
}

/** What matters this time of year: 2 or 3 short lines and one link to the screen that helps. Nothing renders outside a season. */
export function SeasonCard({ now = new Date() }: { now?: Date }) {
  const s = seasonFor(now)
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
