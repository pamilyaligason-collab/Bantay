import { describe, expect, it } from 'vitest'
import { compareRows, familyAverage, relTo, thirtyDay } from './compareLogic'

const NOW = new Date(2026, 10, 9, 12, 0)
const day = (back: number, steps: number) => ({ kind: 'steps', minutes: null, steps, startedAt: new Date(2026, 10, 9 - back, 9).toISOString(), source: 'manual' })
const run = (n: number, steps: number, from = 0) => Array.from({ length: n }, (_, i) => day(from + i, steps))
const td = (avg: number | null, days: number) => ({ avg, days })

describe('thirtyDay', () => {
  it('mean over the days that have steps, counted; a day with no steps is not a 0', () => {
    expect(thirtyDay([day(0, 4000), day(2, 6000), day(40, 99999)], NOW)).toEqual({ avg: 5000, days: 2 })
  })
  it('nothing: null average, 0 days', () => {
    expect(thirtyDay([], NOW)).toEqual({ avg: null, days: 0 })
  })
  it('the 30-day window includes today and the 29 days before it, not the 30th', () => {
    expect(thirtyDay([day(29, 1000)], NOW).days).toBe(1)
    expect(thirtyDay([day(30, 1000)], NOW).days).toBe(0)
  })
})

describe('relTo and familyAverage', () => {
  it('within 5% is about the same', () => {
    expect(relTo(5800, 6000)).toBe('about the same as')
    expect(relTo(5000, 6000)).toBe('lower than')
    expect(relTo(7000, 6000)).toBe('higher than')
  })
  it('family average counts only people with 7 or more days, the viewer included', () => {
    expect(familyAverage([td(4000, 10), td(6000, 7), td(9000, 6), td(null, 0)])).toEqual({ avg: 5000, people: 2 })
    expect(familyAverage([td(9000, 6)])).toEqual({ avg: null, people: 0 })
  })
})

describe('compareRows: hidden under 7 days', () => {
  it('the viewer with 6 days of steps gets no comparison at all', () => {
    expect(compareRows({ me: thirtyDay(run(6, 5000), NOW), member: { name: 'Ana', t: td(7000, 20) }, others: [td(7000, 20)], goal: 6000 })).toEqual([])
  })
  it('7 days: the goal row, hand-computed 5,000 is lower than 6,000', () => {
    const rows = compareRows({ me: thirtyDay(run(7, 5000), NOW), member: null, others: [], goal: 6000 })
    expect(rows.map((r) => r.id)).toEqual(['goal'])
    expect(rows[0]!.line).toBe("Your average of 5,000 steps a day is lower than the Bantay goal of 6,000. That is Bantay's own default, not a medical target.")
  })
  it('a member with 6 days is left out, with 7 days is in; the family row needs 2 people', () => {
    const me = td(5000, 12)
    expect(compareRows({ me, member: { name: 'Ana', t: td(8000, 6) }, others: [td(8000, 6)], goal: 6000 }).map((r) => r.id)).toEqual(['goal'])
    const rows = compareRows({ me, member: { name: 'Ana', t: td(8000, 7) }, others: [td(8000, 7), td(null, 0)], goal: 6000 })
    expect(rows.map((r) => r.id)).toEqual(['goal', 'member', 'family'])
    expect(rows[1]!.line).toBe("Your average is lower than Ana's (8,000 a day).")
    expect(rows[2]!.line).toBe('Your average is lower than the family average (6,500 a day, from 2 people).')
  })
  it('an average of 0 is not data', () => {
    expect(compareRows({ me: td(0, 10), member: null, others: [], goal: 6000 })).toEqual([])
  })
})
