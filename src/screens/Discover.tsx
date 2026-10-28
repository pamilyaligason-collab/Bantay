import type { CSSProperties } from 'react'
import { DISCOVER_SUBS, isDiscoverSubRoot, subOf, subScreen, type DiscoverSub } from '../features/discover'
import { PickCard, SeasonCard } from '../features/discover/today/Cards'
import '../features/shell/shell.css'
import '../features/discover/discover.css'

/** Discover tab: Learn, Listen, Play, Watch, News. A sub that no lane has registered yet shows a short "Coming in this update" card.
 *  The hash is the source of truth (`#discover/<sub>`), so Back and deep links work. Today's pick sits above the sub-nav on a sub's own page (not on a recipe or a game);
 *  the season card sits under it, on every sub's own page. */
export default function Discover() {
  const sub = subOf(location.hash)
  const root = isDiscoverSubRoot(location.hash) || /^#?discover\/?$/.test(location.hash)
  const pick = (s: DiscoverSub) => { if (location.hash !== '#discover/' + s) location.hash = 'discover/' + s }
  const Sub = subScreen(sub)
  const meta = DISCOVER_SUBS.find((s) => s.id === sub)!
  const at = DISCOVER_SUBS.findIndex((s) => s.id === sub)
  return (
    <>
      <div className="hdr">
        <span className="eyebrow">Something good for today</span>
        <h1>Discover</h1>
      </div>
      {root && <PickCard />}
      {root && <SeasonCard />}
      <div className="dc-subnav" role="group" aria-label="Discover sections" style={{ '--i': at, '--n': DISCOVER_SUBS.length } as CSSProperties}>
        <span className="dc-pill" aria-hidden="true" />
        {DISCOVER_SUBS.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === sub} onClick={() => pick(s.id)}>{s.label}</button>
        ))}
      </div>
      {Sub ? <Sub /> : (
        <section className="card dc-soon" aria-label={meta.label}>
          <b className="sh-h2">Coming in this update</b>
          <span className="sub">{meta.soon}</span>
        </section>
      )}
    </>
  )
}
