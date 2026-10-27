import { DISCOVER_SUBS, subOf, subScreen, type DiscoverSub } from '../features/discover'
import '../features/shell/shell.css'

/** Discover tab (round 2): Learn, Listen, Play, Watch, News. A sub that no lane has registered yet shows a short "Coming in this update" card.
 *  The hash is the source of truth (`#discover/<sub>`), so Back and deep links work. */
export default function Discover() {
  const sub = subOf(location.hash)
  const pick = (s: DiscoverSub) => { if (location.hash !== '#discover/' + s) location.hash = 'discover/' + s }
  const Sub = subScreen(sub)
  const meta = DISCOVER_SUBS.find((s) => s.id === sub)!
  return (
    <>
      <div className="hdr">
        <span className="eyebrow">Something good for today</span>
        <h1>Discover</h1>
      </div>
      <div className="dc-subnav" role="group" aria-label="Discover sections">
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
