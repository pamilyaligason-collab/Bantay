import { describe, expect, it } from 'vitest'
import { groupLabs, labBand, labInfo, labRow, labVerdict, lastThree, moveWords } from './labsLogic'
import type { Reading } from './ranges'

const r = (test: string, value: number, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', takenAt: '2026-10-01T08:00:00Z', test, value, unit: 'mg/dL', ...extra })

describe('labVerdict', () => {
  it('gives a word and an icon, and nothing without a range', () => {
    expect(labVerdict('above')).toMatchObject({ word: 'High', icon: 'up' })
    expect(labVerdict('below')).toMatchObject({ word: 'Low', icon: 'down' })
    expect(labVerdict('within')).toMatchObject({ word: 'In range', icon: 'check' })
    expect(labVerdict('none')).toBeNull()
  })
})

describe('labBand', () => {
  it('puts a value inside the range between the band edges', () => {
    const b = labBand(75, { low: 70, high: 99 })!
    expect(b.edge).toBeNull()
    expect(b.you).toBeGreaterThan(b.band.from)
    expect(b.you).toBeLessThan(b.band.to)
    expect(b.lowAt).toBe(b.band.from)
    expect(b.highAt).toBe(b.band.to)
  })
  it('clamps a value far outside the range to the track end', () => {
    expect(labBand(900, { low: 70, high: 99 })).toMatchObject({ you: 97, edge: 'high' })
    expect(labBand(-50, { low: 70, high: 99 })).toMatchObject({ you: 3, edge: 'low' })
  })
  it('labels only the edge that exists', () => {
    expect(labBand(120, { low: null, high: 99 })).toMatchObject({ lowAt: null, edge: 'high' })
    expect(labBand(120, { low: null, high: 99 })!.highAt).not.toBeNull()
    expect(labBand(30, { low: 40, high: null })).toMatchObject({ highAt: null, edge: 'low' })
    expect(labBand(30, { low: 40, high: null })!.lowAt).not.toBeNull()
  })
  it('draws no band for an unknown range or value', () => {
    expect(labBand(5, null)).toBeNull()
    expect(labBand(5, { low: null, high: null })).toBeNull()
    expect(labBand(NaN, { low: 1, high: 2 })).toBeNull()
  })
})

describe('labRow and groupLabs', () => {
  it('judges against the lab range, then the guide; no range stays unknown', () => {
    expect(labRow(r('x', 12, { labLow: 4, labHigh: 10 })).pos).toBe('above')
    expect(labRow(r('ldl', 162)).pos).toBe('above')
    expect(labRow(r('ldl', 80)).pos).toBe('within')
    expect(labRow(r('mystery', 5)).pos).toBe('none')
    expect(labRow(r('mystery', 5)).unitGap).toBe(false) // no range anywhere
    expect(labRow({ ...r('ldl', 4.2), unit: 'mmol/L' }).unitGap).toBe(true) // a mg/dL guide exists, mmol/L is not converted
  })
  it('lists out-of-range first, then in range, then no range', () => {
    const g = groupLabs([r('ldl', 80), r('mystery', 5), r('triglycerides', 400), r('x', 1, { labLow: 4, labHigh: 10 })].map((x) => labRow(x)))
    expect(g.ask.map((x) => x.reading.test).sort()).toEqual(['triglycerides', 'x'])
    expect(g.usual.map((x) => x.reading.test)).toEqual(['ldl'])
    expect(g.noRange.map((x) => x.reading.test)).toEqual(['mystery'])
  })
})

describe('moveWords', () => {
  it('depends on the side of the range, not up or down', () => {
    expect(moveWords(8.1, 9.4, { low: null, high: 7 })).toBe('toward the usual range') // down, but toward
    expect(moveWords(4, 5.5, { low: 5, high: null })).toBe('away from the usual range') // down, away
    expect(moveWords(6, 7, { low: 5, high: null })).toBe('in the usual range both times')
    expect(moveWords(3, 3, { low: 5, high: null })).toBe('no change from the one before')
    expect(moveWords(3, 4, null)).toBe('')
  })
})

describe('lastThree', () => {
  it('returns the newest three in the latest unit with movement words', () => {
    const rs = [
      r('ldl', 150, { takenAt: '2026-07-01T00:00:00Z' }), r('ldl', 130, { takenAt: '2026-08-01T00:00:00Z' }),
      r('ldl', 120, { takenAt: '2026-09-01T00:00:00Z' }), r('ldl', 110, { takenAt: '2026-10-01T00:00:00Z' })
    ]
    const h = lastThree(rs, 'ldl')
    expect(h.map((x) => x.value)).toEqual([110, 120, 130])
    expect(h[0]!.move).toBe('toward the usual range')
    expect(h[2]!.move).not.toBe('')
    expect(lastThree([...rs, r('ldl', 3, { takenAt: '2026-10-02T00:00:00Z', unit: 'mmol/L' })], 'ldl').map((x) => x.value)).toEqual([3])
  })
})

describe('labInfo', () => {
  it('knows common tests and falls back to a neutral line', () => {
    expect(labInfo('LDL').known).toBe(true)
    expect(labInfo('hdl_cholesterol').known).toBe(true)
    expect(labInfo('mystery').known).toBe(false)
    expect(labInfo('mystery').measures).toMatch(/Your doctor/)
  })
})
