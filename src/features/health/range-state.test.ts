import { describe, expect, it } from 'vitest'
import { barLayout } from './model'
import { latestVsNormal, rangeState, type Reading } from './ranges'

const r = (test: string, value: number, unit?: string): Reading => ({ personId: 'p1', takenAt: '2024-01-01', test, value, unit })

describe('general ranges and range state', () => {
  it('adds a general range where the lab printed none, and says so', () => {
    const v = latestVsNormal(r('hdl', 35, 'mg/dL'))
    expect(v.headlineFrom).toBe('general')
    expect(v.headline).toBe('below')
    expect(v.general?.text).toBe('40 or more')
    expect(latestVsNormal(r('rbc', 8.13, '10^6/uL')).headline).toBe('above')
    expect(latestVsNormal(r('platelets', 250, '10^3/uL')).headline).toBe('within')
  })
  it('a lab range still wins over the general one', () => {
    expect(latestVsNormal({ ...r('creatinine', 1.5, 'mg/dL'), labLow: 0.5, labHigh: 1.6 }).headline).toBe('within')
  })
  it('no general range when the unit does not match, so no wrong flag', () => {
    expect(latestVsNormal(r('creatinine', 70, 'umol/L')).headline).toBe('none')
  })
  it('No range is its own state, not Within range', () => {
    expect(rangeState('none')).toMatchObject({ kind: 'none', word: 'No range' })
    expect(rangeState('within').word).toBe('Within range')
    expect(rangeState('above')).toMatchObject({ kind: 'high', word: 'High' })
    expect(rangeState('below')).toMatchObject({ kind: 'low', word: 'Low' })
  })
})

describe('range bar track', () => {
  it('keeps the dot inside the track and flags the edge when out of range', () => {
    const hi = barLayout(250, null, { low: 40, high: 60 })
    expect(hi.now).toBeLessThanOrEqual(97)
    expect(hi.edge).toBe('high')
    expect(barLayout(10, null, { low: 40, high: 60 }).edge).toBe('low')
    const mid = barLayout(50, null, { low: 40, high: 60 })
    expect(mid.edge).toBeNull()
    expect(mid.band).toEqual({ from: 25, to: 75 })
    expect(barLayout(5, null, { low: null, high: 10 }).band).toEqual({ from: 0, to: 66.7 })
  })
})
