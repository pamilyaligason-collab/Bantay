import { describe, expect, it, vi } from 'vitest'

vi.mock('uplot', () => ({ default: class {} })) // uPlot needs a canvas and matchMedia
vi.mock('../../lib/chart', () => ({ chartColors: () => ({ c1: '', c2: '', ink2: '', sep: '', cell: '' }) }))
const { xRange } = await import('./trend')

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
