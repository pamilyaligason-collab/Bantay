import { useEffect, useRef, type ReactNode } from 'react'
import { SceneHero, Row, useReducedMotion, type Hue, type JackName } from '../../look'
import { Icon, type IconName } from '../../shell/Icon'
import { pickOfDay, pickView, type PickKind } from './pick'
import { seasonFor, type Season } from './season'
import { dayKey } from '../play/score'
import '../../weather/scene.css' // wxs-rain streaks, reused by the rainy-season row
import '../discover.css'

const JACK: Record<PickKind, JackName> = { recipe: 'cooking', video: 'watching', trivia: 'reading', fact: 'reading' }

/** Today's pick: one item per local day, a Scene hero (amber) with Jack art by pick type. The whole card is the link; a video leaves the app (new tab, or the in-app browser on the phone).
 *  Jack drifts up to 8 px as the page scrolls (R19); still under reduced motion. */
export function PickCard({ now = new Date() }: { now?: Date }) {
  const p = pickOfDay(dayKey(now))
  const v = pickView(p)
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const jack = box.current?.querySelector<HTMLElement>('.sc-jack')
    const sc = box.current?.closest<HTMLElement>('.scroll')
    if (!jack || !sc || reduced) return
    let raf = 0
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { jack.style.transform = `translateY(${Math.min(8, sc.scrollTop * 0.08).toFixed(1)}px)` }) }
    sc.addEventListener('scroll', on, { passive: true })
    return () => { sc.removeEventListener('scroll', on); cancelAnimationFrame(raf); jack.style.transform = '' }
  }, [reduced])
  const link = (
    <a className="hc-link" href={v.href} {...(v.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {v.title}
      {v.external && <span className="dc-sr"> (opens YouTube)</span>}
    </a>
  )
  return (
    <div ref={box} className="dc-hero">
      <SceneHero
        testId="pick"
        compact
        scene={<div className="dc-pickscene" />}
        kicker={`Today's pick · ${v.eyebrow}`}
        title={link}
        body={<span className="dc-pick-sub">{v.sub}<Icon name={v.external ? 'out' : 'chev'} size={16} /></span>}
        jack={JACK[p.kind]}
        jackSize={96}
      />
    </div>
  )
}

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
