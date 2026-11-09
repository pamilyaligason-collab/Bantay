import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { inPeriod } from './model'
import { avgText, axisTicks, monotonePath,chartGeometry, chartPoints, dailySpread, dayLabelXs, MetricChart, tickLabel } from './MetricChart'

afterEach(cleanup)
const NOW = new Date('2026-11-01T12:00:00Z')
const at = (d: string, h = 12) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`
const texts = (c: HTMLElement) => [...c.querySelectorAll('text.mc-t')].map((t) => t.textContent).filter((t) => t !== '7 days ago' && t !== 'today')

describe('H3 chart axis', () => {
  it('sleep: a night and a nap on the same day are one point, 8.25 h', () => {
    const pts = chartPoints([{ takenAt: at('2026-10-31', 2), value: 7.5 }, { takenAt: at('2026-10-31', 14), value: 0.75 }, { takenAt: at('2026-10-30'), value: 6 }], 'hours')
    expect(pts.map((p) => p.value)).toEqual([6, 8.25])
  })
  it('sleep: ticks are 0, 4 h, 8 h (hand-computed), never below zero', () => {
    const { container } = render(<MetricChart pts={[{ takenAt: at('2026-10-31', 2), value: 7.5 }, { takenAt: at('2026-10-31', 14), value: 0.75 }]} days={7} now={NOW} unit="hours" label="Sleep this week" />)
    expect(texts(container)).toEqual(['8 h', '4 h', '0'])
    expect(container.querySelectorAll('rect.mc-bar')).toHaveLength(1)
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('8 h 15')
  })
  it('sleep labels are hours and minutes', () => {
    expect(tickLabel(7.5, 'hours')).toBe('7 h 30')
    expect(tickLabel(4, 'hours')).toBe('4 h')
    expect(tickLabel(0, 'hours')).toBe('0')
  })
  it('steps, sleep and glucose never draw a tick below 0', () => {
    for (const [unit, vals] of [['steps', [4200, 9000]], ['hours', [6, 7]], ['mg/dL', [10, 100]]] as const) {
      const g = chartGeometry({ pts: vals.map((value, i) => ({ takenAt: at(`2026-10-${30 + i}`), value })), days: 7, now: NOW, unit })
      expect(g.lo).toBeGreaterThanOrEqual(0)
      const t = axisTicks(g.lo, g.hi, unit)
      expect(t.length).toBeGreaterThanOrEqual(2)
      expect(Math.min(...t)).toBeGreaterThanOrEqual(0)
    }
  })
  it('other metrics keep their own span (blood pressure is not pulled down to 0)', () => {
    const g = chartGeometry({ pts: [{ takenAt: at('2026-10-31'), value: 120 }, { takenAt: at('2026-10-30'), value: 140 }], days: 7, now: NOW, unit: 'mmHg' })
    expect(g.lo).toBeGreaterThan(100)
    expect(axisTicks(g.lo, g.hi, 'mmHg').every((t) => Number.isInteger(t))).toBe(true)
  })
  it('a one-sided band stretching the low edge never puts the axis of a non-negative metric below 0', () => {
    const g = chartGeometry({ pts: [{ takenAt: at('2026-10-31'), value: 1 }, { takenAt: at('2026-10-30'), value: 100 }], days: 7, now: NOW, band: { low: null, high: 10 }, unit: 'mmHg' })
    expect(g.lo).toBeGreaterThanOrEqual(0)
  })
  it('H3 invariant: never more than 6 ticks, never below lo, highest first, for any span and unit', () => {
    const units = ['', 'mmHg', 'steps', 'hours', 'mg/dL', 'kg', '%']
    const spans: Array<[number, number]> = []
    for (const lo of [0, 0.001, 0.5, 1.2, 5.6, 36.6, 70, 70.1, 120, 4200, 9999, 123456]) for (const w of [0.0005, 0.01, 0.1, 0.8, 1, 3, 16.8, 40, 250, 5000, 1e6]) spans.push([lo, lo + w])
    for (const unit of units) for (const [lo, hi] of spans) {
      const t = axisTicks(lo, hi, unit)
      expect(t.length, `${unit} ${lo}-${hi}`).toBeLessThanOrEqual(6)
      expect(Math.min(...t), `${unit} ${lo}-${hi}`).toBeGreaterThanOrEqual(lo - 1e-9)
      expect(t, `${unit} ${lo}-${hi}`).toEqual([...t].sort((a, b) => b - a))
    }
  })
  it('H3: one reading and narrow data draw 3 to 4 ticks, not hundreds', () => {
    const one = chartGeometry({ pts: [{ takenAt: at('2026-10-31'), value: 70 }], days: 30, now: NOW, unit: 'kg' })
    expect(axisTicks(one.lo, one.hi, 'kg').length).toBeLessThanOrEqual(6)
    for (const [lo, hi] of [[5.6, 5.64], [70, 70.04], [1.2, 1.2004]]) { const l = axisTicks(lo, hi, 'kg').map((v) => tickLabel(v, 'kg')); expect(new Set(l).size).toBe(l.length) } // no two ticks share a label
    const narrow = chartGeometry({ pts: [70.1, 70.9].map((value, i) => ({ takenAt: at(`2026-10-${30 + i}`), value })), days: 30, now: NOW, unit: 'kg' })
    expect(narrow.ticks.length).toBeGreaterThanOrEqual(2)
    expect(narrow.ticks.length).toBeLessThanOrEqual(6)
    const a1c = chartGeometry({ pts: [5.6, 6.4].map((value, i) => ({ takenAt: at(`2026-10-${30 + i}`), value })), days: 30, now: NOW, unit: '%' })
    expect(a1c.ticks.length).toBeLessThanOrEqual(6)
    const { container } = render(<MetricChart pts={[{ takenAt: at('2026-10-31'), value: 70 }]} days={30} now={NOW} unit="kg" label="Weight" />)
    expect(container.querySelectorAll('line.mc-grid').length).toBeLessThanOrEqual(6)
    expect(texts(container).length).toBeLessThanOrEqual(6)
  })
  it('H3: the sleep axis never goes below zero, in hours and minutes, for any data', () => {
    for (const vals of [[0.2], [0.25, 0.5], [7.5], [6, 7, 8.25], [0.1, 11.9], [23.9]]) {
      const g = chartGeometry({ pts: vals.map((value, i) => ({ takenAt: at(`2026-10-${20 + i}`), value })), days: 30, now: NOW, unit: 'hours' })
      expect(g.lo).toBeGreaterThanOrEqual(0)
      expect(g.ticks.length).toBeLessThanOrEqual(6)
      for (const t of g.ticks) { expect(t).toBeGreaterThanOrEqual(0); expect(tickLabel(t, 'hours')).not.toContain('-') }
    }
  })
})

describe('7-day day labels sit under their day (round 2)', () => {
  const g = (now: Date) => chartGeometry({ pts: [{ takenAt: now.toISOString(), value: 1 }], days: 7, now, unit: 'kg' })
  it('at noon each label is at its own noon: x = 38 + (i + 1) / 7 * 264 (L 38, plot width 264, hand-computed)', () => {
    const now = new Date(2026, 10, 1, 12, 0)
    const xs = dayLabelXs(g(now).x, now)
    xs.forEach((x, i) => expect(x).toBeCloseTo(38 + ((i + 1) / 7) * 264, 5))
  })
  it('before noon today and yesterday would touch (24 units): labels step left by at most 12 units, never apart from their day by more, and stay 36 apart', () => {
    const now = new Date(2026, 10, 3, 3, 22)
    const gx = g(now).x
    const xs = dayLabelXs(gx, now)
    expect(xs[6]).toBeCloseTo(302, 5) // clamped to now
    expect(xs[5]).toBeCloseTo(302 - 36, 5) // Mon noon is 15.37 h before now = 277.85, shifted to 266
    const own = (i: number) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); d.setHours(12, 0, 0, 0); return gx(d.toISOString()) }
    xs.forEach((x, i) => { expect(own(i) - x).toBeGreaterThanOrEqual(-1e-9); expect(own(i) - x).toBeLessThanOrEqual(12) })
    expect(Math.min(...xs.slice(1).map((x, i) => x - xs[i]!))).toBeGreaterThanOrEqual(36 - 1e-9)
  })
})

describe('S22 charts: bars, gaps, smooth lines, reading a value', () => {
  const sleep = (days: Array<[string, number]>) => days.map(([d, value]) => ({ takenAt: at(d), value }))
  const bar = (c: HTMLElement) => [...c.querySelectorAll('rect.mc-bar')].map((r) => ({ x: Number(r.getAttribute('x')), h: Number(r.getAttribute('height')) }))

  it('gaps not zero: 2 logged nights of 7 draw 2 bars; the empty days draw nothing; a real tiny value stays tiny but visible', () => {
    const { container } = render(<MetricChart pts={sleep([['2026-10-27', 7.5], ['2026-10-31', 0.3]])} days={7} now={NOW} unit="hours" label="Sleep this week" />)
    const b = bar(container)
    expect(b).toHaveLength(2) // 5 days with no log: no bar, no 0
    const [big, tiny] = [b[0]!, b[1]!]
    expect(tiny.h).toBeGreaterThanOrEqual(2) // 0.3 h on a 0-8 h axis is about 4 units: tiny, not hidden
    expect(tiny.h).toBeLessThan(big.h / 10) // and not rounded up to look like a night
    expect(container.querySelectorAll('path.mc-line')).toHaveLength(0) // no line is drawn through the gap
  })
  it('bars sit one per local day, newest at the right, even the day before noon today', () => {
    const now = new Date(2026, 10, 3, 3, 22)
    const iso = (d: number) => new Date(2026, 10, d, 9).toISOString()
    const { container } = render(<MetricChart pts={[{ takenAt: iso(3), value: 6 }, { takenAt: iso(2), value: 7 }]} days={7} now={now} unit="hours" label="Sleep" />)
    const b = bar(container)
    expect(b[1]!.x - b[0]!.x).toBeCloseTo(264 / 7, 5) // one column apart (plot width 264, hand-computed)
  })
  it('the header shows the average over logged days only: (7.5 + 6) / 2 = 6 h 45 m, steps 4 200 and 7 800 average 6,000', () => {
    const { container } = render(<MetricChart pts={sleep([['2026-10-29', 7.5], ['2026-10-31', 6]])} days={7} now={NOW} unit="hours" label="Sleep this week" />)
    expect(container.querySelector('[data-testid=metric-avg]')!.textContent).toBe('Avg this week 6 h 45 min')
    expect(avgText([4200, 7800], 'steps')).toBe('6,000 steps')
  })
  it('steps draw a goal line at the goal and keep it on the axis', () => {
    const { container } = render(<MetricChart pts={sleep([['2026-10-31', 4000]])} days={7} now={NOW} unit="steps" goal={6000} label="Steps this week" />)
    expect(container.querySelector('line.mc-goal')).toBeTruthy()
    expect(container.querySelector('text.mc-g')!.textContent).toBe('Goal 6,000')
    expect(chartGeometry({ pts: sleep([['2026-10-31', 4000]]), days: 7, now: NOW, unit: 'steps', goal: 6000 }).hi).toBeGreaterThanOrEqual(6000)
  })
  it('monotone curve never leaves the band of the points (no overshoot), passes through each, and flat runs stay flat', () => {
    const p = [{ x: 0, y: 50 }, { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 60 }]
    const d = monotonePath(p)
    expect(d.startsWith('M0.0 50.0C')).toBe(true)
    const ys = [...d.matchAll(/C([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/g)].flatMap((m) => [Number(m[2]), Number(m[4]), Number(m[6])])
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10 - 1e-6)
    expect(Math.max(...ys)).toBeLessThanOrEqual(60 + 1e-6)
    expect(monotonePath([{ x: 0, y: 1 }])).toBe('')
  })
  it('a line metric draws an area, a curve, the last dot emphasized, and month dates instead of "30 days ago"', () => {
    const { container } = render(<MetricChart pts={[{ takenAt: at('2026-10-10'), value: 70 }, { takenAt: at('2026-10-20'), value: 72 }, { takenAt: at('2026-10-31'), value: 71 }]} days={30} now={NOW} unit="kg" label="Weight" />)
    expect(container.querySelector('path.mc-area')!.getAttribute('fill')).toMatch(/^url\(#mc/)
    expect(container.querySelector('path.mc-line')!.getAttribute('d')).toContain('C')
    expect(container.querySelectorAll('circle.mc-dot.last')).toHaveLength(1)
    const dates = [...container.querySelectorAll('text.mc-d')].map((t) => t.textContent)
    expect(dates).toHaveLength(5)
    expect(dates[4]).toBe('Nov 1')
    expect(container.textContent).not.toContain('days ago')
  })
  it('keyboard: arrows read each value in a polite live region; the full series is available as text', () => {
    const { container } = render(<MetricChart pts={sleep([['2026-10-30', 6], ['2026-10-31', 7.5]])} days={7} now={NOW} unit="hours" label="Sleep this week" />)
    const wrap = container.querySelector('.mcw')!
    const read = container.querySelector('[data-testid=metric-read]')!
    expect(read.getAttribute('aria-live')).toBe('polite')
    fireEvent.keyDown(wrap, { key: 'End' })
    expect(read.textContent).toMatch(/Oct 31, 7 h 30$/)
    fireEvent.keyDown(wrap, { key: 'ArrowLeft' })
    expect(read.textContent).toMatch(/Oct 30, 6 h$/)
    expect(container.textContent).toMatch(/Oct 30, 6 h\. .*Oct 31, 7 h 30/) // the hidden summary lists every value
  })
})

describe('dailySpread', () => {
  it('groups samples by local day: average, low and high (hand-computed)', () => {
    const r = dailySpread([{ takenAt: at('2026-10-30', 8), value: 60 }, { takenAt: at('2026-10-30', 10), value: 80 }, { takenAt: at('2026-10-31', 9), value: 100 }])
    expect(r.avg.map((p) => p.value)).toEqual([70, 100])
    expect(r.spread.map((s) => [s.min, s.max])).toEqual([[60, 80], [100, 100]])
  })
})

describe('one Manila-day window for the list and the chart (S22 fix)', () => {
  const tz = process.env.TZ
  beforeAll(() => { process.env.TZ = 'Asia/Manila' })
  afterEach(() => { process.env.TZ = tz })
  // Sleep logged Oct 31 is a day-anchored point (12:00Z = 20:00 Manila). "now" is Nov 7 at 10:00 and 21:00 Manila: Oct 31 is 7 days back, outside a 7-day window both times.
  for (const [name, now] of [['10:00', '2026-11-07T02:00:00Z'], ['21:00', '2026-11-07T13:00:00Z']] as const) {
    it(`at ${name} Manila the list and the bars agree on the 7-day window`, () => {
      process.env.TZ = 'Asia/Manila'
      const pts = [{ takenAt: '2026-10-31T12:00:00.000Z', value: 7 }, { takenAt: '2026-11-01T12:00:00.000Z', value: 6 }]
      const shown = inPeriod(pts, 'week', new Date(now))
      expect(shown.map((p) => p.value)).toEqual([6]) // Oct 31 is 7 days back: out of a 7-day window, at any hour
      const { container } = render(<MetricChart pts={shown} days={7} now={new Date(now)} unit="hours" label="Sleep this week" />)
      expect(container.querySelectorAll('rect.mc-bar')).toHaveLength(shown.length)
      const day6 = inPeriod([{ takenAt: '2026-11-01T12:00:00.000Z', value: 6 }], 'week', new Date(now))
      expect(day6).toHaveLength(1)
    })
  }
  it('a log from 6 days back is in both the list and the chart before 20:00 Manila', () => {
    process.env.TZ = 'Asia/Manila'
    const now = new Date('2026-11-07T02:00:00Z')
    const shown = inPeriod([{ takenAt: '2026-11-01T12:00:00.000Z', value: 7 }], 'week', now)
    const { container } = render(<MetricChart pts={shown} days={7} now={now} unit="hours" label="Sleep this week" />)
    expect(shown).toHaveLength(1)
    expect(container.querySelectorAll('rect.mc-bar')).toHaveLength(1)
    expect(container.querySelector('svg')!.getAttribute('aria-label')).not.toMatch(/Infinity|NaN/)
  })
  it('no points: the label says so, never Infinity or NaN', () => {
    const { container } = render(<MetricChart pts={[]} days={7} now={NOW} unit="hours" label="Sleep this week" />)
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('Sleep this week, no readings')
  })
  it('a logged 0 keeps a hairline bar; switching the window clears the picked bar', () => {
    const p = [{ takenAt: '2026-10-31T12:00:00.000Z', value: 0 }, { takenAt: '2026-10-30T12:00:00.000Z', value: 5 }]
    const { container, rerender } = render(<MetricChart pts={p} days={7} now={NOW} unit="steps" label="Steps" />)
    expect([...container.querySelectorAll('rect.mc-bar')].map((r) => Number(r.getAttribute('height')))).toContain(1)
    fireEvent.keyDown(container.querySelector('.mcw')!, { key: 'End' })
    expect(container.querySelector('[data-testid=metric-read]')!.textContent).toMatch(/Oct 31/)
    rerender(<MetricChart pts={p} days={30} now={NOW} unit="steps" label="Steps" />)
    expect(container.querySelector('[data-testid=metric-read]')!.textContent).toMatch(/^Tap a bar/)
  })
})
