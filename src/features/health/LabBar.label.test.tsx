import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabBar } from './LabsList'
import { labRow } from './labsLogic'

afterEach(cleanup)

// The "You" label hangs by --y (the mark's spot, 0..100) so it can never leave the track: --y stays inside 0..100 at the extremes.
const mark = (value: number) => {
  const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'hba1c', value, unit: '%', labLow: 4, labHigh: 5.6 })
  const you = render(<LabBar row={row} />).container.querySelector('.lr-you') as HTMLElement
  return { y: parseFloat(you.style.getPropertyValue('--y')), left: parseFloat(you.style.left), label: you.querySelector('b')!.textContent }
}
describe('LabBar You label stays on the track', () => {
  it('twice the high end: label hangs from the right end', () => {
    const r = mark(11.2)
    expect(r.y).toBeGreaterThanOrEqual(90)
    expect(r.y).toBeLessThanOrEqual(100)
    expect(r.y).toBe(r.left)
    expect(r.label).toBe('You 11.2')
  })
  it('below the low end: label hangs from the left end', () => {
    const r = mark(1)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeLessThanOrEqual(10)
    expect(r.y).toBe(r.left)
  })
  it('in range: label sits mid-track', () => {
    const r = mark(4.8)
    expect(r.y).toBeGreaterThan(30)
    expect(r.y).toBeLessThan(70)
  })
  it('compact (the lead card): a bare "You" and no tick numbers; the full label keeps them', () => {
    const row = labRow({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'hba1c', value: 4.8, unit: '%', labLow: 4, labHigh: 5.6 })
    const c = render(<LabBar row={row} compact />).container
    expect(c.querySelector('.lr-you b')!.textContent).toBe('You')
    expect(c.querySelector('.lr-tick')).toBeNull()
    cleanup()
    const f = render(<LabBar row={row} />).container
    expect(f.querySelector('.lr-you b')!.textContent).toBe('You 4.8')
    expect(f.querySelectorAll('.lr-tick').length).toBe(2)
  })
})
