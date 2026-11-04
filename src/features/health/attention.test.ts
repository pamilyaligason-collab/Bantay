import { describe, expect, it } from 'vitest'
import { pickAttention } from './attention'
import { latestByTest, type Reading } from './ranges'
import { pickLeadLab } from '../today/numbers'

const NOW = new Date('2026-11-01T09:00:00')
const at = (daysAgo: number, sec = 0) => new Date(NOW.getTime() - daysAgo * 86_400_000 + sec * 1000).toISOString()
const r = (test: string, value: number, daysAgo: number, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', test, value, unit: test.startsWith('bp') ? 'mmHg' : 'mg/dL', takenAt: at(daysAgo), ...extra })
const none = () => undefined

describe('pickAttention', () => {
  it('returns null when there are no readings', () => {
    expect(pickAttention([], none, NOW)).toBeNull()
  })

  it('an out-of-range result beats a newer in-range one', () => {
    const latest = [r('ldl', 162, 20), r('bp_systolic', 118, 0), r('bp_diastolic', 76, 0)]
    const a = pickAttention(latest, none, NOW)!
    expect(a.reading.test).toBe('ldl')
    expect(a.row.pos).toBe('above')
    expect(a.pair).toBeUndefined()
  })

  it('of several out-of-range results the furthest outside its range wins (alt 2x over, ldl a quarter over)', () => {
    const latest = [r('ldl', 162, 20), r('alt', 118, 3, { labHigh: 55, unit: 'U/L' })]
    expect(pickAttention(latest, none, NOW)!.reading.test).toBe('alt')
  })

  it('with nothing out of range, the newest result that has a range wins', () => {
    const latest = [r('ldl', 90, 5), r('bp_systolic', 118, 0), r('bp_diastolic', 76, 0)]
    const a = pickAttention(latest, none, NOW)!
    expect(a.reading.test).toBe('bp_systolic')
    expect(a.row.pos).toBe('within')
  })

  it('a bottom number within 60 seconds travels with the top number', () => {
    const latest = [r('bp_systolic', 148, 0), { ...r('bp_diastolic', 90, 0), takenAt: at(0, 30) }]
    const a = pickAttention(latest, none, NOW)!
    expect(a.reading.test).toBe('bp_systolic')
    expect(a.pair).toEqual({ top: 148, bottom: 90 })
  })

  it('H1: the most serious wins, not the newest (a 20-day-old lab 100% over beats a 6-day-old pulse 5% over)', () => {
    const latest = [r('heart_rate', 102, 6, { unit: 'bpm' }), r('alt', 90, 20, { labLow: 10, labHigh: 50, unit: 'U/L' })]
    expect(pickAttention(latest, none, NOW)!.reading.test).toBe('alt')
  })

  it('H1: equal fractions fall back to the newer one', () => {
    const latest = [r('a1', 60, 20, { labLow: 10, labHigh: 50, unit: 'U/L' }), r('a2', 60, 3, { labLow: 10, labHigh: 50, unit: 'U/L' })]
    expect(pickAttention(latest, none, NOW)!.reading.test).toBe('a2')
  })

  it('H1: a result older than 180 days does not lead while anything newer has a range; if it is all there is, it leads and is marked old', () => {
    const recent = r('heart_rate', 102, 6, { unit: 'bpm' })
    const old = r('alt', 90, 200, { labLow: 10, labHigh: 50, unit: 'U/L' })
    expect(pickAttention([recent, old], none, NOW)!.reading.test).toBe('heart_rate')
    const inRange = pickAttention([old, r('ldl', 90, 1)], none, NOW)!
    expect(inRange.reading.test).toBe('ldl') // a recent in-range result beats an old High
    expect(inRange.old).toBe(false)
    const only = pickAttention([old], none, NOW)!
    expect(only.reading.test).toBe('alt')
    expect(only.old).toBe(true)
  })

  it('T1 and H1 agree: Today lab tile and Health hero pick the same lab (5% over 3 days ago vs 300% over 30 days ago)', () => {
    const labs = [r('ast', 42, 3, { labLow: 20, labHigh: 40, unit: 'U/L' }), r('alt', 100, 30, { labLow: 20, labHigh: 40, unit: 'U/L' })]
    expect(pickAttention(labs, none, NOW)!.reading.test).toBe('alt')
    expect(pickLeadLab(labs, NOW)!.test).toBe('alt')
    expect(pickLeadLab([...labs].reverse(), NOW)!.test).toBe('alt')
  })

  it('H1: a High since retested in range is judged on the latest row only (callers pass latestByTest)', () => {
    const latest = latestByTest([r('alt', 118, 100, { labHigh: 55, labLow: 7, unit: 'U/L' }), r('alt', 30, 5, { labHigh: 55, labLow: 7, unit: 'U/L' })])
    expect(pickAttention(latest, none, NOW)!.row.pos).toBe('within')
  })

  it('H1: a high pulse leads only when nothing else is out of range', () => {
    const pulse = r('heart_rate', 130, 1, { unit: 'bpm' })
    const alt = r('alt', 45, 20, { labLow: 20, labHigh: 40, unit: 'U/L' }) // 12% over, much less than the pulse
    expect(pickAttention([pulse, alt], none, NOW)!.reading.test).toBe('alt')
    expect(pickAttention([pulse, r('ldl', 90, 1, { labLow: 50, labHigh: 130, unit: 'mg/dL' })], none, NOW)!.reading.test).toBe('heart_rate')
  })

  it('a bottom number from another time is not paired', () => {
    const latest = [r('bp_systolic', 148, 0), r('bp_diastolic', 90, 2)]
    expect(pickAttention(latest, none, NOW)!.pair).toBeUndefined()
  })
})
