import { clockIn, nowLocal, type Forecast } from './forecast'

const asUtc = (t: string) => Date.parse(`${t.slice(0, 16)}:00Z`) // place-local "YYYY-MM-DDTHH:MM" read as a plain clock, so the phone's own zone never matters

export type SunState = 'before' | 'up' | 'after'
/** Where the sun is: f runs 0 to 1 from sunrise to sunset; before sunrise and after sunset it is night. All in the place's clock (utcOffset), from the phone clock. null when sunrise or sunset is unknown. */
export function sunPosition(fc: Pick<Forecast, 'utcOffset' | 'daily'>, now: number): { state: SunState; f: number } | null {
  const d = fc.daily[0]
  if (!d?.sunrise || !d.sunset) return null
  const rise = asUtc(d.sunrise); const set = asUtc(d.sunset)
  const n = asUtc(nowLocal({ utcOffset: fc.utcOffset } as Forecast, now))
  if (!(set > rise) || Number.isNaN(n)) return null
  return n < rise ? { state: 'before', f: 0 } : n >= set ? { state: 'after', f: 1 } : { state: 'up', f: (n - rise) / (set - rise) }
}

const CX = 150; const CY = 100; const RX = 120; const RY = 80
/** Arc from sunrise to sunset with the sun on it; at night a pale dot rests on the horizon. No animation, so reduced motion needs no special case. */
export default function SunArc({ fc, now }: { fc: Forecast; now: number }) {
  const p = sunPosition(fc, now)
  const d = fc.daily[0]
  if (!p || !d?.sunrise || !d.sunset) return null
  const rise = clockIn(`${d.sunrise}:00Z`, 'UTC'); const set = clockIn(`${d.sunset}:00Z`, 'UTC')
  const up = p.state === 'up'
  const ang = Math.PI * (1 - p.f) // 180 degrees at sunrise, 0 at sunset
  return (
    <section aria-label="Sun" className="card wx-sun" data-testid="wx-sun">
      <svg viewBox="0 0 300 120" role="img" aria-label={`Sun: rose ${rise}, sets ${set}, now ${up ? 'up' : 'down'}`} className="wx-sun-svg">
        <path d={`M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`} fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="2" strokeDasharray="4 5" />
        <line x1={CX - RX - 10} y1={CY} x2={CX + RX + 10} y2={CY} stroke="currentColor" strokeOpacity=".4" strokeWidth="1.5" />
        <circle data-testid="wx-sun-dot" data-state={p.state} cx={up ? CX + RX * Math.cos(ang) : p.state === 'before' ? CX - RX : CX + RX} cy={up ? CY - RY * Math.sin(ang) : CY} r={up ? 9 : 6} fill={up ? '#F5B301' : 'currentColor'} fillOpacity={up ? 1 : 0.8} />
      </svg>
      <div className="wx-sun-t"><span><b>{rise}</b><span className="wx-sub">Sun rises</span></span><span><b>{set}</b><span className="wx-sub">Sun sets</span></span></div>
    </section>
  )
}
