import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import { numberTiles, pickLeadLab } from './numbers'
const now = new Date(2026, 9, 31)
const r = (test: string, value: number, d: Date, extra: Partial<Reading> = {}): Reading => ({ personId: 'me', test, value, unit: 'x', takenAt: d.toISOString(), ...extra })
describe('numberTiles', () => {
  it('no readings: three honest empty tiles', () => {
    const t = numberTiles([], now)
    expect(t.map((x) => [x.kicker, x.value, x.action])).toEqual([['Blood pressure', '--/--', 'Log now'], ['Sugar', '--', 'Log now'], ['Lab results', '--', 'Add a lab paper']])
  })
  it('latest BP pair and sugar; an out-of-range lab is red', () => {
    const t = numberTiles([r('bp_systolic', 128, new Date(2026, 9, 29)), r('bp_diastolic', 82, new Date(2026, 9, 29)), r('fasting_glucose', 96, new Date(2026, 9, 6)), r('alt', 118, new Date(2026, 9, 6), { labHigh: 55 })], now)
    expect(t[0]).toMatchObject({ value: '118', tint: 'red', href: '#health/labs' }) // an out-of-range lab leads
    expect(t[1]).toMatchObject({ value: '128/82', tint: 'blue' })
    expect(t[2]!.value).toBe('96')
  })
  it('a lab with no known range is never called in range', () => {
    const t = numberTiles([r('alt', 40, new Date(2026, 9, 6))], now)
    expect(t[2]!.sub).toContain('No range')
    expect(t[2]!.tint).not.toBe('green')
  })
})

const day = (n: number) => new Date(2026, 9, 31 - n)
describe('pickLeadLab (T1)', () => {
  const high = r('alt', 118, day(20), { labHigh: 55, labLow: 7 })
  const okNew = r('ast', 30, day(1), { labHigh: 40, labLow: 10 })
  it('an in-range newer lab does not hide an older High one', () => {
    expect(pickLeadLab([okNew, high], now)).toBe(high)
    const t = numberTiles([okNew, high], now)
    expect(t[0]).toMatchObject({ kicker: 'ALT', tint: 'red', value: '118' })
    expect(t[0]!.sub).toMatch(/^High · /)
    expect(t).toHaveLength(3)
  })
  it('only the latest result of each test counts: a High since retested in range no longer leads', () => {
    const retest = r('alt', 30, day(5), { labHigh: 55, labLow: 7 })
    expect(pickLeadLab([high, retest], now)).toBe(retest)
    const t = numberTiles([high, retest], now)
    expect(t[0]!.kicker).toBe('Blood pressure') // nothing out of range: the lab tile goes last
    expect(t[2]).toMatchObject({ kicker: 'ALT', value: '30', tint: 'green' })
  })
  it('the furthest outside its range leads, not the newest (5% over 3 days ago vs 375% over 30 days ago)', () => {
    const slight = r('ast', 42, day(3), { labHigh: 40, labLow: 20 }) // 2 over a width of 20 = 10%
    const far = r('alt', 100, day(30), { labHigh: 40, labLow: 20 }) // 60 over a width of 20 = 300%
    expect(pickLeadLab([slight, far], now)).toBe(far)
    expect(pickLeadLab([far, slight], now)).toBe(far)
  })
  it('equal distance: the newer leads', () => {
    const older = r('alt', 60, day(20), { labHigh: 40, labLow: 20 })
    const newer = r('ldl', 60, day(3), { labHigh: 40, labLow: 20 })
    expect(pickLeadLab([older, newer], now)).toBe(newer)
  })
  it('a High older than 180 days does not lead while a newer result has a range', () => {
    const old = r('alt', 118, day(200), { labHigh: 55 })
    expect(pickLeadLab([old, okNew], now)).toBe(okNew)
    expect(numberTiles([okNew, old], now)[2]).toMatchObject({ value: '30', tint: 'green' }) // in range: stays last
  })
  it('an old High that is all there is may show, with its full date including the year', () => {
    const old = r('alt', 118, day(400), { labHigh: 55 })
    const t = numberTiles([old], now)
    expect(t[0]).toMatchObject({ kicker: 'ALT', tint: 'red' })
    expect(t[0]!.sub).toBe('High · 26 Sep 2025')
    expect(numberTiles([high], now)[0]!.sub).not.toMatch(/20\d\d/) // a recent one has no year
  })
  it('no lab with a range: the newest lab; no labs: undefined', () => {
    const a = r('x1', 1, day(5)); const b = r('x2', 2, day(2))
    expect(pickLeadLab([a, b], now)).toBe(b)
    expect(pickLeadLab([], now)).toBeUndefined()
  })
  it('ML-38: the same answer at 23:30 and 00:30 local, with the 180-day edge either side', () => {
    const lab = (daysBack: number) => r('alt', 118, new Date(2026, 9, 31 - daysBack, 12), { labHigh: 55 })
    for (const at of [new Date(2026, 9, 31, 23, 30), new Date(2026, 10, 1, 0, 30)]) {
      expect(numberTiles([lab(170), okNew], at)[0]!.kicker).toBe('ALT') // inside the window leads
      expect(numberTiles([lab(190), okNew], at)[0]!.kicker).toBe('Blood pressure') // 190 days old: the in-range result leads
    }
  })
})
