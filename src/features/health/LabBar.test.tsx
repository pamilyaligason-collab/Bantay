import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabBar } from './LabsList'
import { labRow } from './labsLogic'

afterEach(cleanup)

describe('LabBar mark positions', () => {
  const marks = (latest: number, prev: number) => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'hba1c', value: latest, unit: '%', labLow: 4, labHigh: 5.6 })
    const { container } = render(<LabBar row={row} prevAt={prev} />)
    const left = (sel: string) => parseFloat((container.querySelector(sel) as HTMLElement).style.left)
    return { you: left('.lr-you'), prev: left('[data-testid="lr-prev"]') }
  }
  it('close in-range values are drawn at their true spots, previous to the right of You', () => {
    const m = marks(5.0, 5.2)
    expect(m.prev).toBeGreaterThan(m.you)
    expect(m.prev - m.you).toBeLessThan(8) // not pushed apart
  })
  it('both above the range: the higher one holds the track end, the other steps 8 inward, order kept', () => {
    const a = marks(7, 6.5) // previous lower
    expect(a.prev).toBe(a.you - 8)
    const b = marks(6.5, 7) // previous higher
    expect(b.you).toBe(b.prev - 8)
  })
  it('both below the range: the lower one holds the track end, the other steps 8 inward', () => {
    const a = marks(2, 2.5) // previous higher
    expect(a.prev).toBe(a.you + 8)
    const b = marks(2.5, 2) // previous lower
    expect(b.you).toBe(b.prev + 8)
  })
})

describe('LabBar zone labels', () => {
  const zones = (extra: object) => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'x_test', value: 92, unit: 'mg/dL', ...extra })
    const { container } = render(<LabBar row={row} />)
    return container.querySelector('.lr-zones')?.textContent ?? ''
  }
  it('Low | Normal 70-100 | High under the track', () => {
    const t = zones({ labLow: 70, labHigh: 100 })
    expect(t).toContain('Low')
    expect(t).toContain('Normal 70-100')
    expect(t).toContain('High')
  })
  it('a range with no low limit has no Low label', () => {
    const t = zones({ labHigh: 100 })
    expect(t).not.toContain('Low')
    expect(t).toContain('High')
  })
})

describe('LabBar with a converted unit (1.H14)', () => {
  it('mmol/L glucose: no mg/dL numbers beside the 6.1 mmol/L value', () => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'fasting_glucose', value: 6.1, unit: 'mmol/L' })
    const { container } = render(<LabBar row={row} />)
    const t = container.querySelector('.lr-zones')?.textContent ?? ''
    expect(t).toContain('Normal')
    expect(t).not.toMatch(/\d/)
    expect(container.querySelector('.lr-tick')).toBeNull()
    expect(container.querySelector('.lr-you')).toBeTruthy() // the bar itself still draws
  })
})
