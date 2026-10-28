import { describe, expect, it } from 'vitest'
import { groupLabs, labBand, labDate, labInfo, labNum, labRow, labVerdict, lastThree, moveWords, previousResult, rangeSource, trendOfLastThree } from './labsLogic'
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

describe('labNum (S7: one decimal on the list)', () => {
  it('226.74 -> 226.7, 3.10 -> 3.1, 12 -> 12, 0.72 stays, unknown is empty', () => {
    expect(labNum(226.74)).toBe('226.7')
    expect(labNum(3.1)).toBe('3.1')
    expect(labNum(12)).toBe('12')
    expect(labNum(0.72)).toBe('0.72')
    expect(labNum(0.004)).toBe('0.004')
    expect(labNum(null)).toBe('')
    expect(labNum(Number.NaN)).toBe('')
  })
})

describe('s14 L: rangeSource, previousResult, trendOfLastThree', () => {
  const at = (d: string) => `${d}T12:00:00`
  const hba = [r('hba1c', 7.4, { unit: '%', takenAt: at('2026-04-04'), labLow: 4, labHigh: 5.6 }), r('hba1c', 6.8, { unit: '%', takenAt: at('2026-10-02'), labLow: 4, labHigh: 5.6, sourceFileId: 'f1' }), r('hba1c', 7.1, { unit: '%', takenAt: at('2026-07-03'), labLow: 4, labHigh: 5.6 }), r('ldl', 100, { takenAt: at('2026-10-02') })]
  it('rangeSource says whose range: the lab paper first, else a named guide, else nothing', () => {
    expect(rangeSource(hba[1]!)).toEqual({ kind: 'lab', text: 'Lab range 4 to 5.6' })
    const g = rangeSource(r('ldl', 162))!
    expect(g.kind).toBe('guide')
    expect(g.text).toMatch(/^General guide \(.+, \d{4}\): /)
    expect(rangeSource(r('hba1c', 6.8), { low: null, high: 7 })).toEqual({ kind: 'doctor', text: "Your doctor's target up to 7" })
    expect(rangeSource(r('mystery', 5))).toBeNull()
  })
  it('previousResult: down 0.3, closer to the range (HbA1c 7.1 -> 6.8, top 5.6)', () => {
    const p = previousResult(hba, 'hba1c')!
    expect(p).toMatchObject({ value: 7.1, direction: 'down', change: -0.3, kind: 'closer' })
    expect(p.line).toBe('Before: 7.1 % on 3 Jul · down 0.3 · closer to the range')
  })
  it('previousResult: up and further; same unit only; none with one result', () => {
    const up = [r('ldl', 150, { takenAt: at('2026-07-01') }), r('ldl', 162, { takenAt: at('2026-10-01') })]
    expect(previousResult(up, 'ldl')).toMatchObject({ direction: 'up', change: 12, kind: 'further' })
    const mixed = [r('ldl', 4, { unit: 'mmol/L', takenAt: at('2026-07-01') }), r('ldl', 162, { takenAt: at('2026-10-01') })]
    expect(previousResult(mixed, 'ldl')).toBeNull()
    expect(previousResult([up[1]!], 'ldl')).toBeNull()
  })
  it('previousResult lines: in range both times, crossed, no change', () => {
    const two = (prev: number, latest: number) => [r('hba1c', prev, { unit: '%', takenAt: at('2026-07-03'), labLow: 4, labHigh: 5.6 }), r('hba1c', latest, { unit: '%', takenAt: at('2026-10-02'), labLow: 4, labHigh: 5.6 })]
    const inn = previousResult(two(5.2, 5.0), 'hba1c')!
    expect(inn.kind).toBe('in')
    expect(inn.line).toBe('Before: 5.2 % on 3 Jul · down 0.2 · in the range both times')
    const crossed = previousResult(two(6, 3.5), 'hba1c')!
    expect(crossed.kind).toBe('crossed')
    expect(crossed.line).toBe('Before: 6 % on 3 Jul · down 2.5 · now on the other side of the range')
    const same = previousResult(two(7, 7), 'hba1c')!
    expect(same).toMatchObject({ direction: 'same', change: 0, kind: 'same' })
    expect(same.line).toBe('Before: 7 % on 3 Jul · no change')
  })
  it('rangeSource guide string names the source and year', () => {
    expect(rangeSource(r('ldl', 162))).toEqual({ kind: 'guide', text: 'General guide (MedlinePlus, Cholesterol Levels: What You Need to Know, 2026): Under 100' })
  })
  it('trendOfLastThree reads newest against oldest', () => {
    expect(trendOfLastThree([{ value: 6.8 }, { value: 7.1 }, { value: 7.4 }])).toBe('going down')
    expect(trendOfLastThree([{ value: 9 }, { value: 7 }])).toBe('going up')
    expect(trendOfLastThree([{ value: 5 }, { value: 5 }])).toBe('steady')
    expect(trendOfLastThree([{ value: 5 }])).toBe('')
  })
  it('labDate is a fixed-order local date', () => {
    expect(labDate('2026-10-02T12:00:00')).toBe('2 Oct')
    expect(labDate('2026-10-02T12:00:00', true)).toBe('2 Oct 2026')
    expect(labDate('not a date')).toBe('')
  })
})
