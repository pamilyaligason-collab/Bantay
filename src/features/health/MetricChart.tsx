import { useEffect, useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { daysBefore, localDay, type Point } from './model'

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

export interface ChartSpec { pts: Point[]; spread?: { takenAt: string; min: number; max: number }[]; days: number; now: Date; band?: { low: number | null; high: number | null } | null; label: string; unit: string; goal?: number | null }

/** Pure geometry for the chart so it can be tested: x by time over the window, y over the data and the band. */
export function chartGeometry({ pts, days, now, band, unit = '', goal }: Pick<ChartSpec, 'pts' | 'days' | 'now' | 'band' | 'goal'> & { unit?: string }) {
  const from = now.getTime() - days * DAY
  const vals = pts.map((p) => p.value)
  const edges = [band?.low, band?.high].filter((n): n is number => n != null)
  const zeroBase = unit === 'hours' || unit === 'steps' // totals start at 0
  let lo0 = zeroBase ? 0 : Math.min(...vals, ...edges) // the band's limits are always on the chart, so the green strip can be seen
  let hi0 = Math.max(...vals, ...edges, ...(goal != null ? [goal] : [])) // a goal line is always on the chart
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


/** A smooth curve through the points that never overshoots them (monotone cubic, Fritsch-Butland tangents; the same curve as d3's curveMonotoneX, without the dependency). Points must be left to right. */
export function monotonePath(p: { x: number; y: number }[]): string {
  const n = p.length
  if (n < 2) return ''
  const dx = p.slice(1).map((q, i) => q.x - p[i]!.x)
  const m = p.slice(1).map((q, i) => (dx[i]! > 0 ? (q.y - p[i]!.y) / dx[i]! : 0))
  const t = p.map((_, i) => {
    if (i === 0) return m[0]!
    if (i === n - 1) return m[n - 2]!
    const a = m[i - 1]!, b = m[i]!, h0 = dx[i - 1]!, h1 = dx[i]!
    return a * b <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / a + (h1 + 2 * h0) / b)
  })
  let d = `M${p[0]!.x.toFixed(1)} ${p[0]!.y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3
    d += `C${(p[i]!.x + h).toFixed(1)} ${(p[i]!.y + t[i]! * h).toFixed(1)} ${(p[i + 1]!.x - h).toFixed(1)} ${(p[i + 1]!.y - t[i + 1]! * h).toFixed(1)} ${p[i + 1]!.x.toFixed(1)} ${p[i + 1]!.y.toFixed(1)}`
  }
  return d
}

/** The "Avg this week 7h 5m" figure: the mean over the days that have a log (a day with no log is not a 0). */
export function avgText(values: number[], unit: string): string {
  if (!values.length) return ''
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  if (unit !== 'hours') return `${Math.round(avg).toLocaleString('en-US')} ${unit}`.trim()
  const min = Math.round(avg * 60)
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

const TINT: Record<string, string> = { hours: 'purple', steps: 'amber', mmHg: 'blue' } // the tints Today already gives sleep, steps and blood pressure
const dayWord = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const

/** The reading chart. Sleep and steps: a rounded bar per day (a day with no log is a gap, never 0) with the average on top and the goal as a dashed line.
 *  Everything else: a smooth area line with the normal band shaded. Tap a point or bar, or use the arrow keys, to read its value. Plain SVG, no library. Nothing animates, so there is no motion to reduce. */
export function MetricChart(s: ChartSpec) {
  const uid = `mc${useId().replace(/:/g, '')}`
  const [sel, setSel] = useState<number | null>(null)
  const bars = s.unit === 'hours' || s.unit === 'steps'
  const now = new Date(s.now)
  const cols = s.days
  const colX = (back: number) => L + ((cols - 1 - back + 0.5) / cols) * (W - L - R) // bars sit in one column per local day
  const pts = chartPoints(s.pts, s.unit).filter((p) => !bars || (daysBefore(p.takenAt, now) >= 0 && daysBefore(p.takenAt, now) < cols))
  const dataKey = `${s.days}|${s.pts.length}|${s.pts[0]?.takenAt}|${s.pts[s.pts.length - 1]?.takenAt}`
  useEffect(() => setSel(null), [dataKey]) // a picked index means nothing after the window or data changes
  const sp = s.spread ?? []
  const g = chartGeometry({ ...s, pts: [...pts, ...sp.flatMap((r) => [{ takenAt: r.takenAt, value: r.min }, { takenAt: r.takenAt, value: r.max }])] }) // the axis covers the daily lows and highs too
  g.points.length = pts.length
  const xs = pts.map((p, i) => (bars ? colX(daysBefore(p.takenAt, now)) : g.points[i]!.x))
  const vals = pts.map((p) => p.value)
  const band = s.band && (s.band.low != null || s.band.high != null) ? `, normal ${s.band.low != null ? formatNumber(s.band.low) : 'up'}${s.band.low != null && s.band.high != null ? ' to ' : ' to '}${s.band.high != null ? formatNumber(s.band.high) : 'and above'}` : ''
  const line = g.points.map((p, i) => ({ x: xs[i]!, y: p.y })).sort((a, b) => a.x - b.x)
  const base = H - B
  const lineD = monotonePath(line)
  const areaD = line.length > 1 ? `${lineD}L${line[line.length - 1]!.x.toFixed(1)} ${base}L${line[0]!.x.toFixed(1)} ${base}Z` : ''
  const val = (v: number) => (s.unit === 'hours' ? tickLabel(v, 'hours') : `${s.unit === 'steps' ? v.toLocaleString('en-US') : formatNumber(v)}${s.unit ? ` ${s.unit}` : ''}`)
  const word = (i: number) => `${dayWord(pts[i]!.takenAt)}, ${val(pts[i]!.value)}`
  const bw = Math.min(26, ((W - L - R) / cols) * 0.62)
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !pts.length) return
    const ux = ((e.clientX - r.left) / r.width) * W
    const near = xs.reduce((best, x, i) => (Math.abs(x - ux) < Math.abs(xs[best]! - ux) ? i : best), 0)
    setSel((c) => (c === near ? null : near))
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = e.key === 'ArrowRight' ? Math.min(pts.length - 1, (sel ?? -1) + 1) : e.key === 'ArrowLeft' ? Math.max(0, (sel ?? pts.length) - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? pts.length - 1 : e.key === 'Escape' ? null : undefined
    if (to === undefined) return
    e.preventDefault()
    setSel(to)
  }
  const back = (k: number) => { const d = new Date(now); d.setDate(d.getDate() - k); return d }
  const wk = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  type Lab = { x: number; text: string; anchor: 'start' | 'middle' | 'end' }
  const dateLabels: Lab[] = bars
    ? (s.days === 7 ? [6, 5, 4, 3, 2, 1, 0] : [29, 22, 15, 8, 0]).filter((k) => k < cols).map((k) => ({ x: colX(k), text: (s.days === 7 ? wk : md)(back(k)), anchor: 'middle' }))
    : s.days === 7
      ? dayLabelXs(g.x, now).map((x, i) => ({ x, text: wk(back(6 - i)), anchor: 'middle' }))
      : [0, 1, 2, 3, 4].map((i) => { const d = new Date(now.getTime() - s.days * DAY * (1 - i / 4)); return { x: g.x(d.toISOString()), text: md(d), anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle' } })
  return (
    <div className="mcw" tabIndex={0} role="group" aria-label={`${s.label}. Left and right arrow keys read each value.`} onKeyDown={key} data-tint={TINT[s.unit] ?? 'green'}>
      {bars && vals.length > 0 && <p className="mc-avg" data-testid="metric-avg">Avg {s.days === 7 ? 'this week' : 'last 30 days'} <strong>{avgText(vals, s.unit)}</strong></p>}
      <svg className="mc" viewBox={`0 0 ${W} ${H}`} role="img" onClick={pick} aria-label={pts.length === 0 ? `${s.label}, no readings` : `${s.label}, ${pts.length} ${bars ? (pts.length === 1 ? 'day' : 'days') : 'readings'} from ${tickLabel(Math.min(...vals), s.unit)} to ${tickLabel(Math.max(...vals), s.unit)}${trend(pts)}${band}`} data-testid="metric-chart">
        <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="mc-s0" /><stop offset="1" className="mc-s1" /></linearGradient></defs>
        {g.ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={g.y(t)} y2={g.y(t)} className="mc-grid" />)}
        {g.bandRect && <rect className="mc-band" x={L} width={W - L - R} y={g.bandRect.y1} height={Math.max(2, g.bandRect.y2 - g.bandRect.y1)} />}
        {g.ticks.map((t) => <text key={`t${t}`} x={L - 5} y={g.y(t) + 4} className="mc-t" textAnchor="end">{tickLabel(t, s.unit)}</text>)}
        {dateLabels.map((l, i) => <text key={i} x={l.x} y={H - 6} className="mc-d" textAnchor={l.anchor}>{l.text}</text>)}
        {bars && s.goal != null && <><line className="mc-goal" x1={L} x2={W - R} y1={g.y(s.goal)} y2={g.y(s.goal)} /><text className="mc-g" x={W - R} y={g.y(s.goal) - 4} textAnchor="end">Goal {s.goal.toLocaleString('en-US')}</text></>}
        {bars && vals.length > 1 && <line className="mc-avgline" data-testid="avg-line" x1={L} x2={W - R} y1={g.y(vals.reduce((t, v) => t + v, 0) / vals.length)} y2={g.y(vals.reduce((t, v) => t + v, 0) / vals.length)} />}
        {!bars && sp.length > 1 && <path className="mc-spread" d={`${sp.map((r, i) => `${i ? 'L' : 'M'}${g.x(r.takenAt).toFixed(1)} ${g.y(r.max).toFixed(1)}`).join('')}${[...sp].reverse().map((r) => `L${g.x(r.takenAt).toFixed(1)} ${g.y(r.min).toFixed(1)}`).join('')}Z`} />}
        {bars
          ? pts.map((p, i) => { const h = p.value > 0 ? Math.max(2, base - g.y(p.value)) : 1; // a logged 0 keeps a hairline so it never looks like a day with no log
           return <rect key={i} className={i === sel ? 'mc-bar sel' : 'mc-bar'} x={xs[i]! - bw / 2} width={bw} y={base - h} height={h} rx={Math.min(bw / 2, 6)} /> })
          : <>
            {areaD && <path d={areaD} className="mc-area" fill={`url(#${uid})`} />}
            {line.length > 1 && <path d={lineD} className="mc-line" fill="none" />}
            {g.points.map((p, i) => <circle key={i} cx={xs[i]} cy={p.y} r={i === g.points.length - 1 ? 4.5 : 2.5} className={`${i === g.points.length - 1 ? 'mc-dot last' : 'mc-dot'}${i === sel ? ' sel' : ''}`} />)}
          </>}
      </svg>
      <p className="mc-read" aria-live="polite" data-testid="metric-read">{sel != null && pts[sel] ? word(sel) : `Tap ${bars ? 'a bar' : 'a point'} to read its value`}</p>
      <p style={HIDDEN}>{pts.map((_, i) => word(i)).join('. ')}</p>
    </div>
  )
}
