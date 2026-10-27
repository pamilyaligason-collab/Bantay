import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import { COLOR_OF, SHAPE_OF, pixelOf, tally, yearPixels } from './pixelsLogic'

const at = (m: number, d: number, h = 7) => new Date(2026, m - 1, d, h, 30).toISOString()
const bp = (personId: string, m: number, d: number, sys: number, dia: number, h = 7): Reading[] => [
  { personId, takenAt: at(m, d, h), test: 'bp_systolic', value: sys, unit: 'mmHg' },
  { personId, takenAt: at(m, d, h), test: 'bp_diastolic', value: dia, unit: 'mmHg' }
]

describe('pixelOf', () => {
  it('134/84 is Above target and a square (hand-checked against the BP table: bottom 80 to 84, top 130 to 134)', () => {
    expect(pixelOf(134, 84)).toMatchObject({ level: 'above', word: 'Above target', shape: 'square' })
  })
  it('one shape per level', () => {
    expect(pixelOf(118, 76)).toMatchObject({ word: 'In range', shape: 'circle' })
    expect(pixelOf(125, 78)).toMatchObject({ word: 'A little raised', shape: 'diamond' })
    expect(pixelOf(140, 90)).toMatchObject({ word: 'High', shape: 'tri-up' })
    expect(pixelOf(88, 70)).toMatchObject({ word: 'Low', shape: 'tri-down' })
  })
  it('the five shapes and five colours are all different, so colour is never the only clue', () => {
    expect(new Set(Object.values(SHAPE_OF)).size).toBe(5)
    expect(new Set(Object.values(COLOR_OF)).size).toBe(5)
  })
  it('no numbers is no pixel', () => {
    expect(pixelOf(NaN, NaN)).toBeNull()
  })
})

describe('yearPixels', () => {
  const now = new Date(2026, 2, 10, 12)
  const rows = [
    ...bp('p1', 1, 5, 130, 80), ...bp('p1', 1, 5, 138, 88, 19), // average 134/84
    ...bp('p1', 2, 1, 118, 76),
    { personId: 'p1', takenAt: at(2, 2), test: 'bp_systolic', value: 150, unit: 'mmHg' } as Reading, // top only: unknown, not a pixel
    ...bp('p2', 1, 6, 150, 95) // someone else's number is never drawn
  ]
  const cells = yearPixels({ readings: rows, personId: 'p1', year: 2026, now })
  const cell = (d: string) => cells.find((c) => c.day === d)!
  it('has 365 cells in 2026 and 366 in 2028', () => {
    expect(cells).toHaveLength(365)
    expect(yearPixels({ readings: [], personId: 'p1', year: 2028, now })).toHaveLength(366)
  })
  it('averages a day before judging it', () => {
    expect(cell('2026-01-05').px).toMatchObject({ sys: 134, dia: 84, level: 'above', shape: 'square' })
  })
  it('a day with only a top number, or with nothing, has no pixel', () => {
    expect(cell('2026-02-02').px).toBeNull()
    expect(cell('2026-02-03').px).toBeNull()
  })
  it('only the chosen person', () => expect(cell('2026-01-06').px).toBeNull())
  it('marks days after today as future', () => {
    expect(cell('2026-03-10').future).toBe(false)
    expect(cell('2026-03-11').future).toBe(true)
  })
  it('tally counts marked days per level', () => {
    expect(tally(cells)).toEqual({ days: 2, by: { in: 1, raised: 0, above: 1, high: 0, low: 0 } })
  })
})
