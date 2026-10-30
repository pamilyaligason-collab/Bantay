import { useRef, type CSSProperties } from 'react'
import { useSosActive } from '../family/sosActive'
import { useOnScreen, usePageVisible, useSafetyHash, useSosScreenOpen } from '../look/motion'
import { useReducedMotion } from '../look/useReducedMotion'
import { layersFor, SCRIM, SKY, type Cond, type Tod } from './scene'
import './scene.css'

const CLOUD = 'M20 54h82a22 22 0 0 0 2-43 28 28 0 0 0-52-6 24 24 0 0 0-32 49z' // one soft cloud, 120 x 60
// Two depths: far drifts in 110 s, near in 70 s. `at` (0..1) is how far along the drift it starts, so the sky is already full on mount (negative delay).
const FAR = 110, NEAR = 70
const Cloud = ({ top, size, at, near, o }: { top: string; size: number; at: number; near: boolean; o: number }) => (
  <svg className={`wxs-cloud ${near ? 'wxs-near' : 'wxs-far'}`} viewBox="0 0 120 60" style={{ top, width: size, opacity: o, animationDelay: `${-at * (near ? NEAR : FAR)}s` } as CSSProperties}><path d={CLOUD} /></svg>
)
const STARS = [[8, 12], [22, 30], [37, 9], [52, 24], [64, 8], [76, 34], [88, 14], [95, 40], [14, 52]] as const
const DROPS = (n: number) => Array.from({ length: n }, (_, i) => ({ x: (i * 37 + 7) % 100, d: ((i * 53) % 90) / 100, s: 0.7 + ((i * 29) % 40) / 100, y: 8 + ((i * 41) % 72) }))
const STILL_STREAKS = 8

/** The picture behind the weather text: sky gradient for the time of day, then the layers for the condition. Decorative (aria-hidden).
 *  Motion is CSS only. It is still (static positions: sun/moon in place, clouds at 20% and 60%, 8 streaks, no flash) under reduced motion, while an SOS is up
 *  or on #safety*, and it is paused while the card is off screen or the page is hidden. */
export default function WeatherScene({ tod, cond, hot = false }: { tod: Tod; cond: Cond; hot?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [reduced, sosScreen, sosBanner, safety] = [useReducedMotion(), useSosScreenOpen(), useSosActive(), useSafetyHash()]
  const still = reduced || sosScreen || sosBanner || safety
  const paused = !useOnScreen(ref) || !usePageVisible()
  const [a, b] = SKY[tod]
  const L = layersFor(tod, cond, hot)
  const drops = DROPS(L.rain).slice(0, still ? STILL_STREAKS : undefined)
  return (
    <div ref={ref} className="wxs" data-tod={tod} data-cond={cond} data-hot={hot ? '1' : undefined} data-still={still ? '1' : undefined} data-paused={paused && !still ? '1' : undefined} aria-hidden="true" style={{ '--wxs-a': a, '--wxs-b': b, '--wxs-scrim': SCRIM } as CSSProperties}>
      {L.stars && <div className="wxs-stars">{STARS.map(([x, y], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-i * 0.7}s` }} />)}</div>}
      {L.sun && <div className="wxs-sun" />}
      {L.moon && <div className="wxs-moon" />}
      {L.clouds > 0 && (
        <>
          <Cloud top="4%" size={110} at={0.15} near={false} o={0.4} />
          <Cloud top="38%" size={150} at={0.55} near o={0.55} />
          {L.clouds > 2 && <Cloud top="52%" size={100} at={0.7} near={false} o={0.32} />}
          {L.clouds > 2 && <Cloud top="14%" size={190} at={0.1} near o={0.5} />}
        </>
      )}
      {L.haze && <div className="wxs-haze" />}
      {L.fog && <div className="wxs-fog"><i /><i /><i /></div>}
      {drops.length > 0 && <div className="wxs-rain">{drops.map((d, i) => <i key={i} style={{ left: `${d.x}%`, '--y': `${d.y}%`, animationDelay: `${-d.d}s`, animationDuration: `${d.s * (cond === 'drizzle' ? 1.5 : 1)}s` } as CSSProperties} />)}</div>}
      {L.flash && <div className="wxs-flash" />}
      {L.heat && <div className="wxs-heat" />}
      {L.shimmer && <div className="wxs-shimmer" />}
      <div className="wxs-scrim" />
    </div>
  )
}
