import { describe, expect, it } from 'vitest'
import type { Forecast } from '../weather/forecast'
import { glanceOf } from './lockWeather'

const NOW = Date.parse('2026-10-26T00:30:00Z') // 08:30 in Manila (utcOffset 28800)
const hours = (probs: [string, number][]) => probs.map(([time, prob]) => ({ time, temp: 30, prob, code: 3 }))
const fc = (over: Partial<Forecast> = {}): Forecast => ({
  fetchedAt: new Date(NOW - 20 * 60_000).toISOString(), tz: 'Asia/Manila', utcOffset: 28800,
  current: { time: '2026-10-26T08:30', temp: 30.6, humidity: 70, feels: 35, code: 2, wind: 10, gust: 20, uv: 5 },
  hourly: hours([['2026-10-26T08:00', 90], ['2026-10-26T14:00', 40], ['2026-10-26T15:00', 80], ['2026-10-26T16:00', 90]]),
  daily: [], ...over
})

describe('glanceOf (lock screen weather)', () => {
  it('temperature rounded, words from the code, first likely-rain hour after now in the place clock', () => {
    expect(glanceOf(fc(), NOW)).toEqual({ temp: 31, words: 'partly cloudy', kind: 'cloud', rain: 'rain likely after 3 PM' })
  })
  it('an hour already past (08:00 at 90%) is not "rain likely after"', () => {
    expect(glanceOf(fc({ hourly: hours([['2026-10-26T08:00', 90]]) }), NOW)?.rain).toBeNull()
  })
  it('unknown temperature or a forecast older than 12 h shows nothing', () => {
    expect(glanceOf(fc({ current: { ...fc().current, temp: null } }), NOW)).toBeNull()
    expect(glanceOf(fc({ fetchedAt: new Date(NOW - 13 * 3600_000).toISOString() }), NOW)).toBeNull()
  })
})
