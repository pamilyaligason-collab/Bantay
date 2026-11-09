import { axisTicks, tickLabel } from '../MetricChart'
import { formatNumber } from '../../../lib/labFormat'
import type { Point } from '../model'
import { yearBars } from './sleepLogic'

const W = 320, H = 170, L = 38, R = 18, T = 12, B = 26

/** Year view: twelve months of daily averages as bars from 0, a dashed recommended band when given, a solid line at the average, month labels and a one-line aria summary. A month with no data is a gap. */
export function YearBars({ pts, now, unit, label, band }: { pts: Point[]; now: Date; unit: 'hours' | 'steps'; label: string; band?: { low: number; high: number } | null }) {
  const bars = yearBars(pts, now)
  const have = bars.filter((b) => b.avg != null)
  const vals = have.map((b) => b.avg!)
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  const hi = Math.max(...vals, band?.high ?? 0, 1)
  const ticks = axisTicks(0, hi, unit)
  const top = Math.max(hi, ...ticks)
  const y = (v: number) => H - B - (v / top) * (H - B - T)
  const slot = (W - L - R) / 12
  const bw = Math.min(18, slot * 0.62)
  const fmt = (v: number) => (unit === 'hours' ? tickLabel(v, 'hours') : `${formatNumber(v)} steps`)
  const summary = have.length === 0 ? `${label}, no months with data` : `${label}, ${have.length} ${have.length === 1 ? 'month' : 'months'} from ${fmt(Math.min(...vals))} to ${fmt(Math.max(...vals))}, average ${fmt(avg!)}${band ? `, recommended ${band.low} to ${band.high} hours` : ''}`
  return (
    <div className="mcw" data-tint={unit === 'hours' ? 'purple' : 'amber'} data-testid="year-bars">
      {avg != null && <p className="mc-avg">Avg this year <strong>{fmt(avg)}</strong></p>}
      <svg className="mc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} data-testid="year-chart">
        {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="mc-grid" />)}
        {band && <rect className="mc-band" x={L} width={W - L - R} y={y(band.high)} height={Math.max(2, y(band.low) - y(band.high))} />}
        {ticks.map((t) => <text key={`t${t}`} x={L - 5} y={y(t) + 4} className="mc-t" textAnchor="end">{tickLabel(t, unit)}</text>)}
        {bars.map((b, i) => <text key={b.month} x={L + (i + 0.5) * slot} y={H - 6} className="mc-d" textAnchor="middle" style={i % 2 ? { display: 'none' } : undefined}>{b.label}</text>)}
        {bars.map((b, i) => b.avg == null ? null : <rect key={b.month} className="mc-bar" data-testid="year-bar" x={L + (i + 0.5) * slot - bw / 2} width={bw} y={y(b.avg)} height={Math.max(1, H - B - y(b.avg))} rx={Math.min(bw / 2, 6)} />)}
        {avg != null && <line className="mc-avgline" data-testid="avg-line" x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} />}
      </svg>
      {band && <p className="sub" style={{ margin: '4px 0 0' }}>Dashed band: {band.low} to {band.high} hours, recommended for adults. Solid line: your average.</p>}
    </div>
  )
}
