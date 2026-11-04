import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabBar } from './LabsList'
import { labRow, labVerdict } from './labsLogic'

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

describe('LabBar over text', () => {
  it('twice the high end with a 0 low: "+100% over", You sits in the high zone', () => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'alt', value: 20, unit: 'U/L', labLow: 0, labHigh: 10 })
    const { container } = render(<LabBar row={row} />)
    expect(container.querySelector('[data-testid="lr-over"]')!.textContent).toBe('+100% over')
    expect(parseFloat((container.querySelector('.lr-you') as HTMLElement).style.left)).toBeGreaterThan(50)
  })
  it('R4 451 with 150-450 rounds to 0%: no line, the verdict stays', () => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'alt', value: 451, unit: 'U/L', labLow: 150, labHigh: 450 })
    expect(render(<LabBar row={row} />).container.querySelector('[data-testid="lr-over"]')).toBeNull()
    expect(labVerdict(row.pos)?.word).toBe('High')
  })
  it('in range: no over text', () => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'alt', value: 5, unit: 'U/L', labLow: 0, labHigh: 10 })
    expect(render(<LabBar row={row} />).container.querySelector('[data-testid="lr-over"]')).toBeNull()
  })
})

describe('LabBar printed percent is the distance from the edge (not the range width)', () => {
  const text = (value: number, labLow: number, labHigh: number) => render(<LabBar row={labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'alt', value, unit: 'U/L', labLow, labHigh })} />).container.querySelector('[data-testid="lr-over"]')!.textContent
  it('7 with 12-16: (12-7)/12 = 42% under', () => expect(text(7, 12, 16)).toBe('42% under'))
  it('8 with 4-5.6: (8-5.6)/5.6 = 43% over', () => expect(text(8, 4, 5.6)).toBe('+43% over'))
  it('100 with 10-40: 60/40 = 150% over', () => expect(text(100, 10, 40)).toBe('+150% over'))
})
