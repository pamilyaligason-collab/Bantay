import { describe, expect, it } from 'vitest'
import { approxWords, batteryWords, GREY_AFTER_MS, placeAge, placeLine, placeSub } from './placeAge'

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0)
const age = (ms: number, acc?: number | null) => placeAge(NOW - ms, NOW, acc)
const MIN = 60_000
const H = 3_600_000

describe('placeAge words (D-136)', () => {
  it('under 60 seconds is just now, 60 seconds is 1 min ago', () => {
    expect(age(0).text).toBe('just now')
    expect(age(59_999).text).toBe('just now')
    expect(age(60_000).text).toBe('1 min ago')
  })
  it('a fix ahead of this phone clock is just now, never negative minutes', () => {
    expect(age(-5_000).text).toBe('just now')
    expect(age(-5_000).grey).toBe(false)
  })
  it('minutes run to 59, then hours', () => {
    expect(age(12 * MIN).text).toBe('12 min ago')
    expect(age(H - 1).text).toBe('59 min ago')
    expect(age(H).text).toBe('1 h ago')
    expect(age(5 * H + 59 * MIN).text).toBe('5 h ago')
  })
  it('hours run to 23, then the day is named', () => {
    expect(age(24 * H - 1).text).toBe('23 h ago')
    const day = age(24 * H).text
    expect(day).not.toMatch(/ago|now/)
    expect(day).toMatch(/5/) // 5 November, whatever the locale spells around it
  })
  it('grey only past 6 hours: exactly 6 h is not grey, 6 h and 1 ms is', () => {
    expect(GREY_AFTER_MS).toBe(21_600_000)
    expect(age(6 * H).grey).toBe(false)
    expect(age(6 * H + 1).grey).toBe(true)
    expect(age(5 * H).grey).toBe(false)
  })
  it('accuracy over 500 m adds about ±N km; 500 m and under adds nothing', () => {
    expect(approxWords(20)).toBeNull()
    expect(approxWords(500)).toBeNull()
    expect(approxWords(501)).toBe('about ±0.5 km')
    expect(approxWords(1500)).toBe('about ±1.5 km')
    expect(approxWords(12_000)).toBe('about ±12 km')
    expect(approxWords(null)).toBeNull()
    expect(approxWords(undefined)).toBeNull()
    expect(approxWords(Number.NaN)).toBeNull()
    expect(age(2 * MIN, 1500).approx).toBe('about ±1.5 km')
  })
  it('the line joins age, accuracy and the out-of-date words', () => {
    expect(placeLine(age(12 * MIN))).toBe('12 min ago')
    expect(placeLine(age(12 * MIN, 2000))).toBe('12 min ago · about ±2 km')
    expect(placeLine(age(7 * H))).toBe('7 h ago · may be out of date')
  })
})

describe('battery in words, never by colour alone', () => {
  it('shows low under 30 and charging whatever the level', () => {
    expect(batteryWords(82)).toBe('82%')
    expect(batteryWords(30)).toBe('30%')
    expect(batteryWords(29)).toBe('29% · low')
    expect(batteryWords(18, false)).toBe('18% · low')
    expect(batteryWords(64, true)).toBe('64% · charging')
    expect(batteryWords(10, true)).toBe('10% · charging')
  })
  it('unknown is two dashes, never 0 (ML-05)', () => {
    expect(batteryWords(null)).toBe('--')
    expect(batteryWords(undefined)).toBe('--')
    expect(batteryWords(101)).toBe('--')
    expect(batteryWords(-1)).toBe('--')
  })
  it('placeSub adds the battery after the place age, and leaves it out when unknown', () => {
    expect(placeSub({ fixedAt: NOW - 12 * MIN, accuracyM: 20, batteryPct: 18, charging: false }, NOW)).toBe('12 min ago · Battery 18% · low')
    expect(placeSub({ fixedAt: NOW - 12 * MIN, accuracyM: 20, batteryPct: null, charging: null }, NOW)).toBe('12 min ago')
  })
  it('placeSub gives the battery its own check-in time when it is newer than the place (the daily background check-in, D-151)', () => {
    const base = { accuracyM: 20, batteryPct: 18, charging: false }
    expect(placeSub({ ...base, fixedAt: NOW - 5 * H, batteryAt: NOW - 3 * H }, NOW)).toBe('5 h ago · Battery 18% · low (checked 3 h ago)')
    expect(placeSub({ ...base, fixedAt: NOW - 8 * H, batteryAt: NOW - 20 * MIN }, NOW)).toBe('8 h ago · may be out of date · Battery 18% · low (checked 20 min ago)')
    expect(placeSub({ ...base, fixedAt: NOW - 12 * MIN, batteryAt: NOW - 10 * MIN }, NOW)).toBe('12 min ago · Battery 18% · low') // within 5 minutes of the place: no second time
    expect(placeSub({ ...base, fixedAt: NOW - 12 * MIN, batteryAt: null }, NOW)).toBe('12 min ago · Battery 18% · low')
    expect(placeSub({ ...base, batteryPct: null, fixedAt: NOW - 5 * H, batteryAt: NOW - 3 * H }, NOW)).toBe('5 h ago') // unknown battery shows no battery, whatever batteryAt says
    expect(placeSub({ ...base, batteryPct: null, charging: null, fixedAt: NOW - 5 * H, checkedAt: NOW - 3 * H }, NOW)).toBe('5 h ago · checked in 3 h ago') // the check-in time stands on its own
    expect(placeSub({ ...base, batteryPct: null, charging: null, fixedAt: NOW - 12 * MIN, checkedAt: NOW - 10 * MIN }, NOW)).toBe('12 min ago') // within 5 minutes of the place: no second time
    expect(placeSub({ ...base, batteryPct: null, charging: null, fixedAt: NOW - 8 * H, checkedAt: null }, NOW)).toBe('8 h ago · may be out of date')
  })
})
