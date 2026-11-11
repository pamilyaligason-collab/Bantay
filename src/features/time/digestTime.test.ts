import { describe, expect, it } from 'vitest'
import { digestTimeLine } from './digestTime'

// Hand values: Manila is UTC+8, so 06:45 Manila = 22:45Z the day before. Chicago winter UTC-6 -> 16:45; summer UTC-5 -> 17:45.
const CHI = 'America/Chicago'
describe('digestTimeLine', () => {
  it('on a Manila clock it is just the Manila time', () => {
    expect(digestTimeLine(new Date('2026-12-01T03:00:00Z'), 'Asia/Manila')).toBe('6:45 AM Manila time')
  })
  it('Texas winter: 4:45 PM; Texas summer: 5:45 PM', () => {
    expect(digestTimeLine(new Date('2026-12-01T03:00:00Z'), CHI)).toBe('6:45 AM Manila time (4:45 PM Texas time)')
    expect(digestTimeLine(new Date('2026-07-01T03:00:00Z'), CHI)).toBe('6:45 AM Manila time (5:45 PM Texas time)')
  })
  it('the two clock-change days: Manila 03-07 06:45 is 22:45Z 03-06, still CST; Manila 03-09 06:45 is 22:45Z 03-08, now CDT', () => {
    expect(digestTimeLine(new Date('2026-03-07T03:00:00Z'), CHI)).toContain('4:45 PM Texas')
    expect(digestTimeLine(new Date('2026-03-09T03:00:00Z'), CHI)).toContain('5:45 PM Texas')
    expect(digestTimeLine(new Date('2026-11-01T03:00:00Z'), CHI)).toContain('5:45 PM Texas') // Manila 11-01 06:45 = 10-31 22:45Z, CDT until 11-01 07:00Z
    expect(digestTimeLine(new Date('2026-11-02T03:00:00Z'), CHI)).toContain('4:45 PM Texas') // Manila 11-02 06:45 = 11-01 22:45Z, CST
  })
  it('another zone reads on this phone; the Manila day is used even late in the evening in Texas', () => {
    expect(digestTimeLine(new Date('2026-12-01T03:00:00Z'), 'Europe/London')).toBe('6:45 AM Manila time (10:45 PM on this phone)')
    expect(digestTimeLine(new Date('2026-12-01T03:00:00Z'), CHI)).toBe(digestTimeLine(new Date('2026-12-01T15:00:00Z'), CHI)) // 03:00Z and 15:00Z are both Manila 12-01
  })
})
