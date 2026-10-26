import { formatNumber } from '../../lib/labFormat'
import type { Point } from './model'

const W = 320
const H = 170
const L = 38
const R = 10
const T = 12
const B = 26
const DAY = 86_400_000

export interface ChartSpec { pts: Point[]; days: number; now: Date; band?: { low: number | null; high: number | null } | null; label: string; unit: string }

/** Pure geometry for the chart so it can be tested: x by time over the window, y over the data and the band. */
export function chartGeometry({ pts, days, now, band }: Pick<ChartSpec, 'pts' | 'days' | 'now' | 'band'>) {
  const from = now.getTime() - days * DAY
  const vals = pts.map((p) => p.value)
  const edges = [band?.low, band?.high].filter((n): n is number => n != null)
  const lo0 = Math.min(...vals, ...edges) // the band's limits are always on the chart, so the green strip can be seen
  const hi0 = Math.max(...vals, ...edges)
  const pad = (hi0 - lo0 || Math.abs(hi0) || 1) * 0.12
  const lo = lo0 - pad
  const hi = hi0 + pad
  const x = (iso: string) => L + ((Math.min(now.getTime(), Math.max(from, Date.parse(iso))) - from) / (days * DAY)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const bandRect = band && (band.low != null || band.high != null)
    ? { y1: y(Math.min(band.high ?? hi, hi)), y2: y(Math.max(band.low ?? lo, lo)) }
    : null
  return { x, y, lo, hi, bandRect, points: pts.map((p) => ({ x: x(p.takenAt), y: y(p.value) })) }
}

const trend = (pts: Point[]) => (pts.length < 2 ? '' : pts[pts.length - 1]!.value > pts[0]!.value ? ', going up' : pts[pts.length - 1]!.value < pts[0]!.value ? ', going down' : ', steady')

/** The reading chart: a line over the last 30 (or 7) days with the normal band shaded green. Plain SVG, no library. */
export function MetricChart(s: ChartSpec) {
  const g = chartGeometry(s)
  const vals = s.pts.map((p) => p.value)
  const band = s.band && (s.band.low != null || s.band.high != null) ? `, normal ${s.band.low != null ? formatNumber(s.band.low) : 'up'}${s.band.low != null && s.band.high != null ? ' to ' : ' to '}${s.band.high != null ? formatNumber(s.band.high) : 'and above'}` : ''
  const d = g.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
  const whole = s.unit === 'mmHg' // blood pressure is read in whole numbers
  const ticks = [g.hi, (g.hi + g.lo) / 2, g.lo].map((t) => (whole ? Math.round(t) : t))
  return (
    <svg className="mc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label}, ${s.pts.length} readings from ${formatNumber(Math.min(...vals))} to ${formatNumber(Math.max(...vals))}${trend(s.pts)}${band}`} data-testid="metric-chart">
      {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={g.y(t)} y2={g.y(t)} className="mc-grid" />)}
      {g.bandRect && <rect className="mc-band" x={L} width={W - L - R} y={g.bandRect.y1} height={Math.max(2, g.bandRect.y2 - g.bandRect.y1)} />}
      {ticks.map((t) => <text key={`t${t}`} x={L - 5} y={g.y(t) + 4} className="mc-t" textAnchor="end">{formatNumber(whole ? t : Math.round(t * 10) / 10)}</text>)}
      <text x={L} y={H - 6} className="mc-t">{s.days} days ago</text>
      <text x={W - R} y={H - 6} className="mc-t" textAnchor="end">today</text>
      {g.points.length > 1 && <path d={d} className="mc-line" fill="none" />}
      {g.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === g.points.length - 1 ? 4.5 : 3} className={i === g.points.length - 1 ? 'mc-dot last' : 'mc-dot'} />)}
    </svg>
  )
}
