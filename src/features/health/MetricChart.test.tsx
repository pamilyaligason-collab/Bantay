import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axisTicks, chartGeometry, chartPoints, dayLabelXs, MetricChart, tickLabel } from './MetricChart'

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
    expect(container.querySelectorAll('circle')).toHaveLength(1)
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
