import { describe, expect, it } from 'vitest'
import { activitySeries, bodyNodes, lastNight, sleepNights } from './model'

// S30 live bug: the Today and Health tile said "Sleep 10h 57" while Health > Sleep and the watch said 6 h 38.
// Cause: the tile summed every row that STARTED on one calendar day (a 01:54 start of the night of the 9th plus the 23:58 start of the night that ended on the 10th).
const at = (d: number, h: number, mi = 0) => new Date(2026, 10, d, h, mi).toISOString() // local 2026-11-dd
const hc = (startedAt: string, minutes: number) => ({ kind: 'sleep', minutes, steps: null, startedAt, source: 'health-connect' })
const NOW10 = new Date(2026, 10, 10, 9, 0)
const tile = (acts: ReturnType<typeof hc>[], now: Date) => bodyNodes([], acts, now).find((n) => n.id === 'sleep')!

describe('one sleep selector for tiles, detail and charts', () => {
  const live = [hc(at(9, 1, 54), 259), hc(at(9, 23, 58), 398)]
  it('the tile shows last night only (6h 38), not two nights added (10h 57)', () => {
    expect(tile(live, NOW10).value).toBe('6h 38')
    expect(lastNight(live, NOW10)).toMatchObject({ day: '2026-11-10', minutes: 398 })
  })
  it('overlapping sessions for the same sleep count once (23:00 for 400 min and 23:30 for 360 min end together)', () => {
    const acts = [hc(at(9, 23, 0), 400), hc(at(9, 23, 30), 360)]
    expect(lastNight(acts, NOW10)!.minutes).toBe(400) // union 23:00 to 05:40, not 760
    expect(tile(acts, NOW10).value).toBe('6h 40')
    expect(activitySeries(acts, 'sleep')).toEqual([{ takenAt: '2026-11-10T12:00:00.000Z', value: 6.7 }])
  })
  it('an exact duplicate row (a re-sync) counts once', () => {
    expect(lastNight([hc(at(9, 23, 58), 398), hc(at(9, 23, 58), 398)], NOW10)!.minutes).toBe(398)
  })
  it('a split night adds its parts; a nap is not in the tile but is in the chart point', () => {
    const acts = [hc(at(9, 22, 0), 120), hc(at(10, 1, 30), 180), hc(at(10, 14, 0), 45)]
    const now = new Date(2026, 10, 10, 16, 0)
    expect(lastNight(acts, now)).toMatchObject({ minutes: 300, napMinutes: 45 })
    expect(tile(acts, now).value).toBe('5h 00')
    expect(activitySeries(acts, 'sleep')).toEqual([{ takenAt: '2026-11-10T12:00:00.000Z', value: 5.8 }])
  })
  it('a night older than yesterday is no news on the tile', () => {
    expect(tile([hc(at(5, 23, 0), 400)], NOW10).empty).toBe(true)
  })
  it('the chart point equals the detail hero when there is no nap', () => {
    const pt = activitySeries(live, 'sleep').find((p) => p.takenAt.startsWith('2026-11-10'))!
    expect(pt.value).toBe(Math.round((lastNight(live, NOW10)!.minutes / 60) * 10) / 10)
  })
  it('sleepNights keeps the two nights apart', () => {
    expect([...sleepNights(live).values()].map((n) => [n.day, n.minutes])).toEqual([['2026-11-09', 259], ['2026-11-10', 398]])
  })
})

// ML-38: the app's day is the phone's local day. These dates are built from local parts, so they hold in Manila, Texas (UTC-6) or any zone the runner uses.
describe('the clock at the edge of midnight (23:30 and 00:30 local)', () => {
  const nights = [hc(at(9, 23, 58), 398)] // the night that ended on the morning of the 10th
  it('at 23:30 on the 10th the last night is still the one that ended that morning', () => {
    const now = new Date(2026, 10, 10, 23, 30)
    expect(lastNight(nights, now)).toMatchObject({ day: '2026-11-10', minutes: 398 })
    expect(tile(nights, now).value).toBe('6h 38')
  })
  it('at 00:30 on the 11th it is "yesterday" and still on the tile', () => {
    const now = new Date(2026, 10, 11, 0, 30)
    expect(lastNight(nights, now)).toMatchObject({ day: '2026-11-10', minutes: 398 })
    expect(tile(nights, now).value).toBe('6h 38')
  })
  it('a night that has begun but not ended (22:00 start, 90 min so far) is not the 23:30 figure: it wakes on the 11th', () => {
    const acts = [...nights, hc(at(10, 22, 0), 90)]
    const now = new Date(2026, 10, 10, 23, 30)
    expect(lastNight(acts, now)).toMatchObject({ day: '2026-11-10', minutes: 398 })
  })
  it('a start at 23:58 (32 min) and one at 00:20 (20 min) are one night, and they overlap 00:20 to 00:30, so 23:58 to 00:40 = 42 min (not 52)', () => {
    const acts = [hc(at(10, 23, 58), 32), hc(at(11, 0, 20), 20)]
    const now = new Date(2026, 10, 11, 0, 30)
    expect(lastNight(acts, now)).toMatchObject({ day: '2026-11-11', minutes: 42 })
  })
  it('a nap at 14:00 is a nap on its own day in any zone', () => {
    expect(lastNight([hc(at(10, 14, 0), 45)], new Date(2026, 10, 10, 16, 0))).toBeNull()
  })
})

