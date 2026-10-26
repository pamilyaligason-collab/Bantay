import type { CSSProperties } from 'react'
import { SCRIM, SKY, type Cond, type Tod } from './scene'
import './scene.css'

const CLOUD = 'M20 54h82a22 22 0 0 0 2-43 28 28 0 0 0-52-6 24 24 0 0 0-32 49z' // one soft cloud, 120 x 60
const Cloud = ({ top, size, delay, dur, o }: { top: string; size: number; delay: number; dur: number; o: number }) => (
  <svg className="wxs-cloud" viewBox="0 0 120 60" style={{ top, width: size, opacity: o, animationDelay: `${-delay}s`, animationDuration: `${dur}s` } as CSSProperties}><path d={CLOUD} /></svg>
)
const STARS = [[8, 12], [22, 30], [37, 9], [52, 24], [64, 8], [76, 34], [88, 14], [95, 40], [14, 52]] as const
const DROPS = (n: number) => Array.from({ length: n }, (_, i) => ({ x: (i * 37 + 7) % 100, d: ((i * 53) % 90) / 100, s: 0.7 + ((i * 29) % 40) / 100 }))
const COUNT: Partial<Record<Cond, number>> = { drizzle: 10, rain: 18, storm: 24 }

/** The picture behind the weather text: sky gradient for the time of day, then the layers for the condition. Decorative (aria-hidden).
 *  Motion is CSS only and stops under prefers-reduced-motion (rain and the storm flash are then left out, the sky and clouds stay). */
export default function WeatherScene({ tod, cond, hot = false }: { tod: Tod; cond: Cond; hot?: boolean }) {
  const [a, b] = SKY[tod]
  const night = tod === 'night'
  const wet = cond === 'drizzle' || cond === 'rain' || cond === 'storm'
  const grey = cond === 'overcast' || cond === 'fog' || wet
  const showBody = cond === 'clear' || cond === 'partly' || cond === 'none'
  const clouds = cond === 'partly' ? 2 : cond === 'clear' || cond === 'none' ? 0 : cond === 'fog' ? 1 : 4
  const n = COUNT[cond] ?? 0
  return (
    <div className="wxs" data-tod={tod} data-cond={cond} data-hot={hot ? '1' : undefined} aria-hidden="true" style={{ '--wxs-a': a, '--wxs-b': b, '--wxs-scrim': SCRIM } as CSSProperties}>
      {night && cond !== 'overcast' && !wet && cond !== 'fog' && (
        <div className="wxs-stars">{STARS.map(([x, y], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-i * 0.7}s` }} />)}</div>
      )}
      {showBody && (night ? <div className="wxs-moon" /> : <div className="wxs-sun" />)}
      {clouds > 0 && (
        <>
          <Cloud top="4%" size={150} delay={0} dur={46} o={0.55} />
          <Cloud top="38%" size={110} delay={20} dur={60} o={0.4} />
          {clouds > 2 && <Cloud top="14%" size={190} delay={9} dur={52} o={0.5} />}
          {clouds > 2 && <Cloud top="52%" size={140} delay={31} dur={70} o={0.38} />}
        </>
      )}
      {grey && <div className="wxs-haze" />}
      {cond === 'fog' && <div className="wxs-fog"><i /><i /><i /></div>}
      {n > 0 && <div className="wxs-rain">{DROPS(n).map((d, i) => <i key={i} style={{ left: `${d.x}%`, animationDelay: `${-d.d}s`, animationDuration: `${d.s * (cond === 'drizzle' ? 1.5 : 1)}s` }} />)}</div>}
      {cond === 'storm' && <div className="wxs-flash" />}
      {hot && <div className="wxs-heat" />}
      <div className="wxs-scrim" />
    </div>
  )
}
