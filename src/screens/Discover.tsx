import type { CSSProperties } from 'react'
import { DISCOVER_SUBS, isDiscoverSubRoot, subOf, subScreen, type DiscoverSub } from '../features/discover'
import Overview from '../features/discover/Overview'
import { SeasonCard } from '../features/discover/today/Cards'
import { SubHeader } from '../features/shell/SubHeader'
import { useKv } from '../features/shell/useKv'
import { MEDCARDS_FLAG } from '../features/discover/learn/Screen'
import '../features/shell/shell.css'
import '../features/discover/discover.css'

/** Discover tab. `#discover` is the overview (video hero and two more videos, season row, Learn, Listen, Play, the fact of the day, News); `#discover/<sub>` is that sub's screen under a pill row (Learn, Watch, Listen, Play, News).
 *  A sub that no lane has registered yet shows a short "Coming in this update" card. The hash is the source of truth, so Back and deep links work. */
export default function Discover() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  if (/^#?discover\/?$/.test(location.hash)) return <Overview />
  if (location.hash === '#discover/season') {
    return (
      <>
        <SubHeader title="This season" backHref="#discover" backLabel="Back to Discover" />
        <SeasonCard />
      </>
    )
  }
  const sub = subOf(location.hash)
  const root = isDiscoverSubRoot(location.hash)
  const pick = (s: DiscoverSub) => { if (location.hash !== '#discover/' + s) location.hash = 'discover/' + s }
  const Sub = subScreen(sub)
  const meta = DISCOVER_SUBS.find((s) => s.id === sub)!
  const at = DISCOVER_SUBS.findIndex((s) => s.id === sub)
  // The Memory and Word search games and Fun facts draw their own Back + game-name title.
  // Learn pages below its home (recipes, a recipe, cook mode, medicine cards, benefits, together) draw their own Back + title header.
  // An unknown page, or a medicine page while the flag is off, falls through to the Discover header + pills + Learn home instead of a bare Learn home.
  const own = /^#discover\/learn\/(?:recipes|recipe\/.+|cook\/.+|together|benefits)$/.test(location.hash) || /^#discover\/play\/(?:memory|wordsearch|facts)$/.test(location.hash) || (medcards && /^#discover\/learn\/(?:meds|med\/.+)$/.test(location.hash))
  if (own && Sub) return <Sub />
  return (
    <>
      {root ? <SubHeader title={meta.label} backHref="#discover" backLabel="Back to Discover" /> : <div className="hdr"><h1>Discover</h1></div>}
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
