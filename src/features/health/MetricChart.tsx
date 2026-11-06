import { formatNumber } from '../../lib/labFormat'
import { localDay, type Point } from './model'

const W = 320
const H = 170
const L = 38
const R = 18 // room for the last day label to stay centred under its point (it was end-anchored and ran into the day before at 360)
const T = 12
const B = 26
const DAY = 86_400_000

/** Activity totals: sleep (unit "hours") and steps are one point per local day, summed, so a nap joins its night. Other metrics are drawn as given. */
export function chartPoints(pts: Point[], unit: string): Point[] {
  if (unit !== 'hours' && unit !== 'steps') return pts
  const days = new Map<string, number>()
  for (const p of pts) days.set(localDay(p.takenAt), (days.get(localDay(p.takenAt)) ?? 0) + p.value)
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ takenAt: `${day}T12:00:00.000Z`, value: Math.round(value * 100) / 100 }))
}

/** Many samples a day (a watch's pulse): one point per local day at the day's average, plus that day's lowest and highest for a faint band. */
export function dailySpread(pts: Point[]): { avg: Point[]; spread: { takenAt: string; min: number; max: number }[] } {
  const days = new Map<string, number[]>()
  for (const p of pts) { const k = localDay(p.takenAt); days.set(k, [...(days.get(k) ?? []), p.value]) }
  const rows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ takenAt: `${day}T12:00:00.000Z`, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), min: Math.min(...v), max: Math.max(...v) }))
  return { avg: rows.map((r) => ({ takenAt: r.takenAt, value: r.avg })), spread: rows.map((r) => ({ takenAt: r.takenAt, min: r.min, max: r.max })) }
}

const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 12, 24]
const MAX_TICKS = 6
/** Whole-number steps for the axis (1, 2, 5, 10, 20, ...), or hour steps for sleep. Never more than 6 ticks, whatever the data (one value, a narrow span): the smallest step of at least a third of the span that gives 2 to 6 ticks,
 *  else the smallest step that gives 2 to 6, else just the two ends. Highest tick first, never below `lo`. */
export function axisTicks(lo: number, hi: number, unit = ''): number[] {
  if (!(hi > lo)) return Number.isFinite(lo) ? [lo] : []
  const raw = (hi - lo) / 3
  const whole = unit === 'mmHg' || unit === 'steps' // read in whole numbers
  const mag = 10 ** Math.max(whole ? 0 : -3, Math.floor(Math.log10(Math.max(raw, 0.001))) - 1)
  const cands = unit === 'hours' ? HOUR_STEPS : Array.from({ length: 12 }, (_, i) => [1, 2, 5][i % 3]! * mag * 10 ** Math.floor(i / 3))
  const at = (step: number) => { const out: number[] = []; for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9 && out.length <= MAX_TICKS; k++) out.push(Math.round(k * step * 1e6) / 1e6); return out }
  const fits = (c: number) => { const n = at(c).length; return n >= 2 && n <= MAX_TICKS }
  const step = cands.find((c) => c >= raw && fits(c)) ?? cands.find(fits)
  const out = (step === undefined ? [lo, hi] : at(step)).reverse()
  return out.filter((t, i) => out.findIndex((u) => tickLabel(u, unit) === tickLabel(t, unit)) === i) // invariant: no two ticks print the same label
}

/** An axis or reading label: sleep in hours and minutes ("7 h 30"), the rest as numbers. 0 is just "0". */
export function tickLabel(v: number, unit: string): string {
  if (unit !== 'hours') return formatNumber(v)
  if (v === 0) return '0'
  const h = Math.floor(v + 1e-9)
  const m = Math.round((v - h) * 60)
  return m === 0 ? `${h} h` : h === 0 ? `${m} min` : `${h} h ${m}`
}

export interface ChartSpec { pts: Point[]; spread?: { takenAt: string; min: number; max: number }[]; days: number; now: Date; band?: { low: number | null; high: number | null } | null; label: string; unit: string }

/** Pure geometry for the chart so it can be tested: x by time over the window, y over the data and the band. */
export function chartGeometry({ pts, days, now, band, unit = '' }: Pick<ChartSpec, 'pts' | 'days' | 'now' | 'band'> & { unit?: string }) {
  const from = now.getTime() - days * DAY
  const vals = pts.map((p) => p.value)
  const edges = [band?.low, band?.high].filter((n): n is number => n != null)
  const zeroBase = unit === 'hours' || unit === 'steps' // totals start at 0
  let lo0 = zeroBase ? 0 : Math.min(...vals, ...edges) // the band's limits are always on the chart, so the green strip can be seen
  let hi0 = Math.max(...vals, ...edges)
  const floor0 = lo0 >= 0 ? 0 : -Infinity // a metric that cannot be negative never gets an axis below 0 (decided from the data, before the band stretches lo0)
  // A one-sided band (BP "under 120") would be a sliver at the edge: give it a visible share of the chart on its open side.
  if (band && band.low == null && band.high != null && !zeroBase) lo0 = Math.min(lo0, band.high - Math.max((hi0 - lo0) * 0.6, Math.abs(band.high) * 0.08))
  if (band && band.high == null && band.low != null) hi0 = Math.max(hi0, band.low + Math.max((hi0 - lo0) * 0.6, Math.abs(band.low) * 0.08))
  const pad = (hi0 - lo0 || Math.abs(hi0) || 1) * 0.12
  let lo = Math.max(floor0, lo0 - pad)
  let hi = hi0 + pad
  // Invariant: the printed axis covers every plotted value. A top tick below the highest value (or a bottom tick above the lowest) would leave a dot off the printed scale, so widen to the next tick until both ends are covered.
  let ticks = axisTicks(lo, hi, unit)
  const vmax = Math.max(...vals), vmin = Math.min(...vals)
  for (let i = 0; i < 4 && ticks.length >= 2; i++) {
    const step = ticks[0]! - ticks[1]!
    const top = ticks[0]!, bottom = ticks[ticks.length - 1]!
    const needTop = vmax - top > step * 0.15, needBottom = bottom - vmin > step * 0.15 && lo > floor0 // a dot a hair past a tick still reads off that tick; more than 15% of a step gets its own tick
    if (!needTop && !needBottom) break
    if (needTop) hi = top + step * Math.ceil((vmax - top) / step - 1e-9) + step * 0.12
    if (needBottom) lo = Math.max(floor0, bottom - step * Math.ceil((bottom - vmin) / step - 1e-9) - step * 0.12)
    ticks = axisTicks(lo, hi, unit)
  }
  const x = (iso: string) => L + ((Math.min(now.getTime(), Math.max(from, Date.parse(iso))) - from) / (days * DAY)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const bandRect = band && (band.low != null || band.high != null)
    ? { y1: y(Math.min(band.high ?? hi, hi)), y2: y(Math.max(band.low ?? lo, lo)) }
    : null
  return { x, y, lo, hi, bandRect, ticks, points: pts.map((p) => ({ x: x(p.takenAt), y: y(p.value) })) }
}

const trend = (pts: Point[]) => (pts.length < 2 ? '' : pts[pts.length - 1]!.value > pts[0]!.value ? ', going up' : pts[pts.length - 1]!.value < pts[0]!.value ? ', going down' : ', steady')

/** x of the seven day labels of a 7-day chart: each at its day's noon on the time axis (so it sits under that day's dots), but never closer than `min` units to the next label. Before noon today's label clamps to "now" and would sit on yesterday's; yesterday's (and any earlier one that needs it) steps left by the shortfall. */
export function dayLabelXs(x: (iso: string) => number, now: Date, min = 36): number[] {
  const xs = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); d.setHours(12, 0, 0, 0); return x(d.toISOString()) })
  for (let i = 5; i >= 0; i--) xs[i] = Math.min(xs[i]!, xs[i + 1]! - min)
  return xs
}

/** The reading chart: a line over the last 30 (or 7) days with the normal band shaded green. Plain SVG, no library. */
export function MetricChart(s: ChartSpec) {
  const pts = chartPoints(s.pts, s.unit)
  const sp = s.spread ?? []
  const g = chartGeometry({ ...s, pts: [...pts, ...sp.flatMap((r) => [{ takenAt: r.takenAt, value: r.min }, { takenAt: r.takenAt, value: r.max }])] }) // the axis covers the daily lows and highs too
  g.points.length = pts.length
  const vals = pts.map((p) => p.value)
  const band = s.band && (s.band.low != null || s.band.high != null) ? `, normal ${s.band.low != null ? formatNumber(s.band.low) : 'up'}${s.band.low != null && s.band.high != null ? ' to ' : ' to '}${s.band.high != null ? formatNumber(s.band.high) : 'and above'}` : ''
  const d = g.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
  const ticks = g.ticks
  return (
    <svg className="mc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label}, ${pts.length} readings from ${tickLabel(Math.min(...vals), s.unit)} to ${tickLabel(Math.max(...vals), s.unit)}${trend(pts)}${band}`} data-testid="metric-chart">
      {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={g.y(t)} y2={g.y(t)} className="mc-grid" />)}
      {g.bandRect && <rect className="mc-band" x={L} width={W - L - R} y={g.bandRect.y1} height={Math.max(2, g.bandRect.y2 - g.bandRect.y1)} />}
      {ticks.map((t) => <text key={`t${t}`} x={L - 5} y={g.y(t) + 4} className="mc-t" textAnchor="end">{tickLabel(t, s.unit)}</text>)}
      {s.days === 7
        ? dayLabelXs(g.x, new Date(s.now)).map((x, i) => { const d = new Date(s.now); d.setDate(d.getDate() - (6 - i)); return <text key={i} x={x} y={H - 6} className="mc-d" textAnchor="middle">{d.toLocaleDateString('en-US', { weekday: 'short' })}</text> })
        : <><text x={L} y={H - 6} className="mc-t">{s.days} days ago</text><text x={W - R} y={H - 6} className="mc-t" textAnchor="end">today</text></>}
      {sp.length > 1 && <path className="mc-spread" d={`${sp.map((r, i) => `${i ? 'L' : 'M'}${g.x(r.takenAt).toFixed(1)} ${g.y(r.max).toFixed(1)}`).join('')}${[...sp].reverse().map((r) => `L${g.x(r.takenAt).toFixed(1)} ${g.y(r.min).toFixed(1)}`).join('')}Z`} />}
      {g.points.length > 1 && <path d={d} className="mc-line" fill="none" />}
      {g.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === g.points.length - 1 ? 4.5 : 3} className={i === g.points.length - 1 ? 'mc-dot last' : 'mc-dot'} />)}
    </svg>
  )
}
