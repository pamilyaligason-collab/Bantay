import { describe, expect, it, vi } from 'vitest'

vi.mock('uplot', () => ({ default: class {} })) // uPlot needs a canvas and matchMedia
vi.mock('../../lib/chart', () => ({ chartColors: () => ({ c1: '', c2: '', ink2: '', sep: '', cell: '' }) }))
const { xRange, bucketWeeks, dateLabel, MAX_POINTS } = await import('./trend')

describe('xRange', () => {
  it('one point gets a few days either side, not years', () => {
    const t = Date.parse('2026-10-16') / 1000
    const [a, b] = xRange(t, t)
    expect(b - a).toBe(6 * 86_400)
    expect(new Date(b * 1000).getUTCFullYear()).toBe(2026)
  })
  it('a long series gets a small pad', () => {
    const [a, b] = xRange(0, 100 * 86_400)
    expect(a).toBeLessThan(0)
    expect(b - a).toBeLessThan(120 * 86_400)
  })
})

describe('bucketWeeks', () => {
  it('83 points over a year become at most 12 weekly buckets', () => {
    const xs = Array.from({ length: 83 }, (_, i) => Math.round(Date.parse('2026-01-01') / 1000 + i * 4.3 * 86_400))
    const [bx, by] = bucketWeeks([xs, xs.map((_, i) => 100 + (i % 7))])
    expect(bx.length).toBeLessThanOrEqual(MAX_POINTS)
    expect(by.length).toBe(bx.length)
  })
  it('13 weekly points stay within 12 buckets', () => { const xs = Array.from({ length: 13 }, (_, i) => i * 7 * 86_400); expect(bucketWeeks([xs, xs.map(() => 1)])[0].length).toBeLessThanOrEqual(MAX_POINTS) })
  it('few points stay as they are', () => expect(bucketWeeks([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]))
  it('dates use en-PH', () => expect(dateLabel(Date.parse('2026-10-16T12:00:00Z') / 1000)).toBe(new Date('2026-10-16T12:00:00Z').toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })))
})
