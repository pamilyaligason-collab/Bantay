import { describe, expect, it } from 'vitest'
import type { Medication } from '../log/store'
import { daysLeft, dateWords, perDayOf, refillBy, refillLine, refillTask, stockRows, uncounted, unitsLeft } from './stock'

const NOW = new Date(2026, 9, 20, 9, 0) // Tue 20 Oct 2026, local
const med = (o: Partial<Medication> = {}): Medication => ({ personId: 'p1', name: 'Metformin', medStatus: 'active', schedule: { v: 1, times: ['08:00', '20:00'] }, ...o })

describe('stock math', () => {
  it('per day: saved value, else times a day, none for as-needed', () => {
    expect(perDayOf(med({ perDay: 3 }))).toBe(3)
    expect(perDayOf(med())).toBe(2)
    expect(perDayOf(med({ asNeeded: true, schedule: { v: 1, times: [] } }))).toBeNull()
    expect(perDayOf(med({ schedule: { v: 1, times: [] } }))).toBeNull()
  })
  it('days left = stock / per day counted from when the stock was set', () => {
    expect(daysLeft(med({ stockQty: 14, stockSetAt: NOW.toISOString() }), NOW)).toBe(7)
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000).toISOString()
    expect(unitsLeft(med({ stockQty: 14, stockSetAt: twoDaysAgo }), NOW)).toBeCloseTo(10)
    expect(daysLeft(med({ stockQty: 14, stockSetAt: twoDaysAgo }), NOW)).toBe(5)
  })
  it('never negative, zero runs out today, unknown stays null', () => {
    const old = new Date(NOW.getTime() - 30 * 86_400_000).toISOString()
    expect(daysLeft(med({ stockQty: 14, stockSetAt: old }), NOW)).toBe(0)
    expect(unitsLeft(med({ stockQty: 14, stockSetAt: old }), NOW)).toBe(0)
    expect(daysLeft(med(), NOW)).toBeNull()
    expect(daysLeft(med({ stockQty: 9, asNeeded: true, schedule: { v: 1, times: [] } }), NOW)).toBeNull()
  })
  it('refill-by date and the plain line', () => {
    expect(dateWords(refillBy(7, NOW))).toBe('Tue 27 Oct')
    expect(refillLine(7, refillBy(7, NOW))).toBe('7 days left: refill by Tue 27 Oct')
    expect(refillLine(1, refillBy(1, NOW))).toBe('1 day left: refill by Wed 21 Oct')
    expect(refillLine(0, NOW)).toBe('Runs out today: refill now')
  })
  it('rows: counted live medicines, fewest days first, low flagged; paused and others people left out', () => {
    const meds = [
      med({ name: 'Amlodipine', strength: '5 mg', schedule: { v: 1, times: ['08:00'] }, stockQty: 18, stockSetAt: NOW.toISOString() }),
      med({ stockQty: 14, stockSetAt: NOW.toISOString() }),
      med({ name: 'Old', stockQty: 5, medStatus: 'paused' }),
      med({ name: 'Theirs', personId: 'p2', stockQty: 5 }),
      med({ name: 'Uncounted' })
    ]
    const rows = stockRows(meds, 'p1', NOW)
    expect(rows.map((r) => [r.name, r.days, r.low])).toEqual([['Metformin', 7, true], ['Amlodipine 5 mg', 18, false]])
    expect(uncounted(meds, 'p1').map((m) => m.name)).toEqual(['Uncounted'])
    // no times and no per_day: listed so the daily use can be set; as-needed ones are never counted
    const noUse = [med({ name: 'NoTimes', schedule: { v: 1, times: [] } }), med({ name: 'PRN', asNeeded: true, schedule: { v: 1, times: [] } }), med({ name: 'HasCount', stockQty: 3, schedule: { v: 1, times: [] } })]
    expect(uncounted(noUse, 'p1').map((m) => m.name)).toEqual(['HasCount', 'NoTimes'])
  })
  it('the Plan task is due the day the stock runs out', () => {
    expect(refillTask('Metformin 500 mg', refillBy(7, NOW))).toEqual({ title: 'Refill Metformin 500 mg', due: '2026-10-27' })
  })
})
