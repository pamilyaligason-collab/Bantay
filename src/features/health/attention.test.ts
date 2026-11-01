import { describe, expect, it } from 'vitest'
import { pickAttention } from './attention'
import type { Reading } from './ranges'

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

  it('the newest of several out-of-range results wins', () => {
    const latest = [r('ldl', 162, 20), r('alt', 115, 3, { labHigh: 55, unit: 'U/L' })]
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

  it('a bottom number from another time is not paired', () => {
    const latest = [r('bp_systolic', 148, 0), r('bp_diastolic', 90, 2)]
    expect(pickAttention(latest, none, NOW)!.pair).toBeUndefined()
  })
})
