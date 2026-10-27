import { describe, expect, it } from 'vitest'
import type { Reading } from '../ranges'
import { averagePair, bpWeek, parsePair } from './bpLogic'

const NOW = new Date('2026-10-26T12:00:00')
const day = (n: number, h = 8) => new Date(2026, 9, 26 - n, h, 0).toISOString()
const R = (test: string, value: number, takenAt: string): Reading => ({ personId: 'p1', test, value, unit: 'mmHg', takenAt })
const pair = (s: number, d: number, at: string) => [R('bp_systolic', s, at), R('bp_diastolic', d, at)]

describe('guided check logic', () => {
  it('averages two readings in whole numbers: 138/86 and 130/82 make 134/84; 133/83 and 134/84 round up to 134/84', () => {
    expect(averagePair({ top: 138, bottom: 86, pulse: 74 }, { top: 130, bottom: 82, pulse: 72 })).toEqual({ top: 134, bottom: 84, pulse: 73 })
    expect(averagePair({ top: 133, bottom: 83, pulse: null }, { top: 134, bottom: 84, pulse: null })).toEqual({ top: 134, bottom: 84, pulse: null })
    expect(averagePair({ top: 120, bottom: 80, pulse: 70 }, { top: 120, bottom: 80, pulse: null }).pulse).toBe(70)
  })
  it('refuses numbers that cannot be a reading, with a plain sentence', () => {
    expect(parsePair({ top: '', bottom: '80' })).toMatch(/top and the bottom/)
    expect(parsePair({ top: '500', bottom: '80' })).toMatch(/too small or too big/)
    expect(parsePair({ top: '80', bottom: '120' })).toMatch(/higher than the bottom/)
    expect(parsePair({ top: '120', bottom: '80', pulse: '900' })).toMatch(/pulse/)
    expect(parsePair({ top: '120', bottom: '80', pulse: '' })).toEqual({ top: 120, bottom: 80, pulse: null })
    expect(parsePair({ top: ' 138 ', bottom: '86', pulse: '74' })).toEqual({ top: 138, bottom: 86, pulse: 74 })
  })
  it('7-day average: every reading in the week, days with a reading, nothing older than 7 days', () => {
    const rs = [...pair(138, 86, day(0)), ...pair(130, 82, day(0, 9)), ...pair(128, 80, day(2)), ...pair(200, 120, day(9))]
    const w = bpWeek(rs, NOW)!
    expect(w.top).toBe(132) // (138 + 130 + 128) / 3
    expect(w.bottom).toBe(83) // (86 + 82 + 80) / 3 = 82.7
    expect(w.days).toBe(2)
    expect(w.points.map((p) => p.top)).toEqual([128, 134]) // day -2, then today (138 and 130 average 134)
  })
  it('no readings in the week is null, never 0/0', () => {
    expect(bpWeek([], NOW)).toBeNull()
    expect(bpWeek(pair(150, 90, day(12)), NOW)).toBeNull()
    expect(bpWeek([R('bp_systolic', 150, day(0))], NOW)).toBeNull() // a top with no bottom is not a pair
  })
})
