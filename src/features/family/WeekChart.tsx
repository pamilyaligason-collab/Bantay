import { dayKeys, BAND, type Metric, type Series } from './weekSeries'

const W = 330, H = 170, X0 = 34, X1 = 262, /* X1 stops short of the right edge so the last day label never sits under the Jack button (right 18 px, 62 px wide) */ Y0 = 14, Y1 = 148
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--green)', 'var(--tint-purple-ink)']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const seriesColor = (i: number) => COLORS[i % COLORS.length]!

/** 7-day multi-person line chart as inline SVG (the board is SVG; src/lib/chart.ts is a 2-series uPlot). Colours are tokens, so light and dark follow. A person with no points draws nothing here; the legend says "no readings". */
export function WeekChart({ metric, series, now, label }: { metric: Metric; series: Series[]; now: Date; label: string }) {
  const keys = dayKeys(now)
  const vals = series.flatMap((s) => s.points.filter((p): p is number => p != null))
  const band = BAND[metric]
  const lo0 = Math.min(...vals, ...(band ? [band[0]] : [0]))
  const hi0 = Math.max(...vals, ...(band ? [band[1]] : [1]))
  const pad = (hi0 - lo0) * 0.12 || 1
  const lo = metric === 'bp' ? lo0 - pad : Math.min(0, lo0)
  const hi = hi0 + pad
  const x = (i: number) => X0 + 6 + ((X1 - X0 - 12) * i) / 6
  const y = (v: number) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0)
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => Math.round(t))
  return (
    <svg className="wk" width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-testid="week-chart">
      {band && <rect x={X0} y={y(band[1])} width={X1 - X0} height={Math.max(0, y(band[0]) - y(band[1]))} className="wk-band" />}
      {ticks.map((t) => <g key={t}><line x1={X0} x2={X1} y1={y(t)} y2={y(t)} className="wk-grid" /><text x={0} y={y(t) + 4} className="wk-t">{t}</text></g>)}
      {series.map((s, si) => {
        const color = seriesColor(si)
        const segs: string[][] = [[]]
        s.points.forEach((p, i) => { if (p == null) segs.push([]); else segs[segs.length - 1]!.push(`${x(i).toFixed(1)},${y(p).toFixed(1)}`) })
        return (
          <g key={s.personId} style={{ stroke: color, fill: color }}>
            {segs.filter((g) => g.length > 1).map((g, gi) => <polyline key={gi} points={g.join(' ')} className="wk-line" />)}
            {s.points.map((p, i) => p != null && <circle key={i} cx={x(i)} cy={y(p)} r={i === 6 ? 4 : 2.5} stroke="none" />)}
          </g>
        )
      })}
      {keys.map((k, i) => <text key={k} x={x(i)} y={H - 4} textAnchor="middle" className="wk-t">{DAY[new Date(`${k}T12:00:00`).getDay()]}</text>)}
    </svg>
  )
}
