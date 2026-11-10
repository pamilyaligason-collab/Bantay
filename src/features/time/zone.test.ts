import { afterEach, describe, expect, it } from 'vitest'
import { addDays, dayIn, differsFromMine, minutesIn, offsetMs, setPersonZones, setZone, theirTime, tzDay, tzMidnight, validZone, wallToMs, zoneOf } from './zone'

const CHI = 'America/Chicago'
const MNL = 'Asia/Manila'
const H = 3_600_000

describe('zone helpers (hand-computed: Chicago is UTC-6 in winter, UTC-5 in summer, Manila UTC+8)', () => {
  afterEach(() => { setZone(null); setPersonZones({}, null) })
  it('offsets', () => {
    expect(offsetMs(CHI, Date.parse('2026-12-01T14:00:00Z'))).toBe(-6 * H)
    expect(offsetMs(CHI, Date.parse('2026-07-01T13:00:00Z'))).toBe(-5 * H)
    expect(offsetMs(MNL, Date.parse('2026-07-01T13:00:00Z'))).toBe(8 * H)
  })
  it('winter 2026-12-01 08:00 Chicago = 14:00Z = 22:00 Manila; summer 2026-07-01 08:00 = 13:00Z = 21:00 Manila', () => {
    expect(new Date(wallToMs(CHI, '2026-12-01', '08:00')).toISOString()).toBe('2026-12-01T14:00:00.000Z')
    expect(new Date(wallToMs(CHI, '2026-07-01', '08:00')).toISOString()).toBe('2026-07-01T13:00:00.000Z')
    expect(dayIn(MNL, Date.parse('2026-12-01T14:00:00Z'))).toBe('2026-12-01')
    expect(minutesIn(MNL, Date.parse('2026-12-01T14:00:00Z'))).toBe(22 * 60)
    expect(minutesIn(MNL, Date.parse('2026-07-01T13:00:00Z'))).toBe(21 * 60)
  })
  it('DST change days: 2026-03-08 (spring forward 02:00 CST to 03:00 CDT) and 2026-11-01 (fall back)', () => {
    // 08:00 CDT on 2026-03-08 = 13:00Z (06:00 CST would have been 14:00Z); the day before 08:00 CST = 14:00Z
    expect(new Date(wallToMs(CHI, '2026-03-07', '08:00')).toISOString()).toBe('2026-03-07T14:00:00.000Z')
    expect(new Date(wallToMs(CHI, '2026-03-08', '08:00')).toISOString()).toBe('2026-03-08T13:00:00.000Z')
    expect(new Date(wallToMs(CHI, '2026-03-08', '00:00')).toISOString()).toBe('2026-03-08T06:00:00.000Z') // midnight is still CST
    expect(new Date(wallToMs(CHI, '2026-10-31', '08:00')).toISOString()).toBe('2026-10-31T13:00:00.000Z')
    expect(new Date(wallToMs(CHI, '2026-11-01', '08:00')).toISOString()).toBe('2026-11-01T14:00:00.000Z') // after the change: CST again
    expect(new Date(wallToMs(CHI, '2026-11-02', '08:00')).toISOString()).toBe('2026-11-02T14:00:00.000Z')
    // Manila never moves
    expect(new Date(wallToMs(MNL, '2026-03-08', '08:00')).toISOString()).toBe('2026-03-08T00:00:00.000Z')
  })
  it('a dose taken at 8 PM Chicago (02:00Z next day) is still that Chicago day, not the next Manila day', () => {
    const t = Date.parse('2026-12-02T02:00:00Z')
    expect(dayIn(CHI, t)).toBe('2026-12-01')
    expect(dayIn(MNL, t)).toBe('2026-12-02')
  })
  it('tzDay and tzMidnight follow the set zone; Manila by default', () => {
    const t = Date.parse('2026-12-01T20:00:00Z') // 14:00 Chicago, 04:00 next day Manila
    expect(tzDay(t)).toBe('2026-12-02')
    setZone(CHI)
    expect(tzDay(t)).toBe('2026-12-01')
    expect(tzMidnight('2026-12-01').toISOString()).toBe('2026-12-01T06:00:00.000Z')
    expect(tzMidnight('2026-12-01', MNL).toISOString()).toBe('2026-11-30T16:00:00.000Z')
  })
  it('a bad zone name is refused', () => {
    expect(validZone('Mars/Olympus')).toBeNull()
    expect(validZone('')).toBeNull()
    expect(validZone(CHI)).toBe(CHI)
    setZone('nonsense')
    expect(tzDay(Date.parse('2026-12-01T20:00:00Z'))).toBe('2026-12-02')
  })
  it('addDays is calendar arithmetic', () => { expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); expect(addDays('2026-01-01', -1)).toBe('2025-12-31') })
  it('other people: their zone, (their time) only when it differs from mine', () => {
    setZone(CHI)
    setPersonZones({ a: MNL, b: CHI }, 'me')
    expect(zoneOf('me')).toBe(CHI)
    expect(zoneOf('a')).toBe(MNL)
    expect(zoneOf('unknown')).toBe(MNL)
    expect(theirTime('8:00 AM', 'a')).toBe('8:00 AM (their time)')
    expect(theirTime('8:00 AM', 'b')).toBe('8:00 AM')
    expect(theirTime('8:00 AM', 'me')).toBe('8:00 AM')
    expect(differsFromMine(null)).toBe(false)
  })
})
