import { describe, expect, it } from 'vitest'
import { lastCheckInWords } from './FacesRow'

// Local-time dates, so the day maths does not depend on the machine's zone. now = Tue 27 Oct 2026, 10:00.
const NOW = new Date(2026, 9, 27, 10, 0)
const at = (m: number, d: number, h = 7, min = 40) => new Date(2026, m, d, h, min).toISOString()

describe('lastCheckInWords (S9)', () => {
  it('today: the time; earlier: yesterday, N days ago, then a date; none or bad: not yet', () => {
    expect(lastCheckInWords(at(9, 27), NOW)).toMatch(/^OK 7:40/)
    expect(lastCheckInWords(at(9, 26, 20, 5), NOW)).toBe('Last OK yesterday') // 20:05 yesterday is still "yesterday", not "today"
    expect(lastCheckInWords(at(9, 24), NOW)).toBe('Last OK 3 days ago')
    expect(lastCheckInWords(at(9, 21), NOW)).toBe('Last OK 6 days ago')
    expect(lastCheckInWords(at(9, 20), NOW)).toBe('Last OK 20 Oct') // 7 days: a date
    expect(lastCheckInWords(at(8, 12), NOW)).toBe('Last OK 12 Sep')
    expect(lastCheckInWords(undefined, NOW)).toBe('No check-in yet')
    expect(lastCheckInWords('not a date', NOW)).toBe('No check-in yet')
    expect(lastCheckInWords(at(9, 28), NOW)).toBe('No check-in yet') // a future time is not a check-in
  })
})
