// @vitest-environment node
// Payloads are trimmed real shapes (Open-Meteo forecast, MET Norway locationforecast/2.0/complete, OpenWeather One Call 3.0 and Air Pollution).
// Expected values are worked out by hand from the inputs, not copied from the code.
import { describe, expect, it, vi } from 'vitest'
import { blend, cellOf, gather, next2h, parseAir, parseMet, parseOpenMeteo, parseOpenWeather, type Series } from './blend.ts'

const NOW = Date.parse('2026-10-31T05:07:00Z') // 13:07 in Manila
const CELL = { lat: 9.65, lon: 123.88 }
const s = (n: number) => NOW / 1000 + n // unix seconds

const om = {
  current: { time: '2026-10-31T13:00', temperature_2m: 30, relative_humidity_2m: 70, apparent_temperature: 36, weather_code: 2, wind_speed_10m: 10, wind_gusts_10m: 20, uv_index: 9 },
  hourly: { time: ['2026-10-31T12:00', '2026-10-31T13:00', '2026-10-31T14:00'], temperature_2m: [29, 30, 31], precipitation_probability: [10, 20, 60], precipitation: [0, 0, 2], weather_code: [1, 2, 61] },
  daily: { time: ['2026-10-31', '2026-11-01'], weather_code: [61, 3], temperature_2m_min: [25, 24], temperature_2m_max: [31, 32], precipitation_probability_max: [60, 30], uv_index_max: [9, 8], sunrise: ['2026-10-31T05:45', '2026-11-01T05:45'], sunset: ['2026-10-31T17:30', '2026-11-01T17:30'] }
}
const met = {
  properties: {
    timeseries: [
      { time: '2026-10-31T05:00:00Z', data: { instant: { details: { air_temperature: 29, relative_humidity: 80, wind_speed: 5, wind_speed_of_gust: 10 } }, next_1_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: { precipitation_amount: 0 } } } },
      { time: '2026-10-31T06:00:00Z', data: { instant: { details: { air_temperature: 30 } }, next_1_hours: { summary: { symbol_code: 'heavyrainshowersandthunder_day' }, details: { precipitation_amount: 4 } } } },
      { time: '2026-10-31T12:00:00Z', data: { instant: { details: { air_temperature: 26 } }, next_6_hours: { summary: { symbol_code: 'rain' } } } }
    ]
  }
}
const ow = {
  current: { dt: s(-60), temp: 31, feels_like: 38, humidity: 75, uvi: 10, wind_speed: 2, wind_gust: 4, weather: [{ id: 803 }] },
  minutely: Array.from({ length: 60 }, (_, i) => ({ dt: s(i * 60 - 420), precipitation: i < 13 ? 0 : 6 })), // minute i is 13:00 + i local: dry until 13:12, then 6 mm/h
  hourly: [
    { dt: Date.parse('2026-10-31T05:00:00Z') / 1000, temp: 31, pop: 0.3, weather: [{ id: 803 }] },
    { dt: Date.parse('2026-10-31T06:00:00Z') / 1000, temp: 32, pop: 0.8, rain: { '1h': 5 }, weather: [{ id: 502 }] }
  ],
  daily: [{ dt: Date.parse('2026-10-31T04:00:00Z') / 1000, temp: { min: 26, max: 33 }, pop: 0.8, uvi: 11, weather: [{ id: 501 }], sunrise: Date.parse('2026-10-30T21:46:00Z') / 1000, sunset: Date.parse('2026-10-31T09:31:00Z') / 1000 }],
  alerts: [{ sender_name: 'PAGASA', event: 'Heavy rainfall warning', start: s(0), end: s(3600), description: 'Orange warning.' }]
}
const air = { list: [{ main: { aqi: 2 }, components: { pm2_5: 12.4, pm10: 20.1 } }] }

describe('cellOf', () => {
  it('rounds to two decimals (about 1.1 km)', () => expect(cellOf({ lat: 9.645705, lon: 123.877951 })).toEqual(CELL))
  it('refuses points outside the Philippines and junk', () => {
    for (const b of [{ lat: 35.68, lon: 139.69 }, { lat: 9.6, lon: 130 }, { lat: '9.6', lon: 123.8 }, { lat: NaN, lon: 123 }, null, {}]) expect(cellOf(b)).toBeNull()
  })
})

describe('parsers', () => {
  it('Open-Meteo: Manila wall clock as sent, rain amount per hour', () => {
    const p = parseOpenMeteo(om)!
    expect(p.now).toMatchObject({ temp: 30, feels: 36, code: 2, wind: 10, uv: 9 })
    expect(p.hours[2]).toEqual({ time: '2026-10-31T14:00', temp: 31, prob: 60, code: 61, rain: 2 })
    expect(p.days[0]).toMatchObject({ date: '2026-10-31', min: 25, max: 31, sunrise: '2026-10-31T05:45' })
  })
  it('MET Norway: UTC to Manila, m/s to km/h, symbol to WMO, only the hourly part', () => {
    const p = parseMet(met)!
    expect(p.now).toMatchObject({ time: '2026-10-31T13:00', temp: 29, humidity: 80, wind: 18, gust: 36, code: 2, feels: null, uv: null })
    expect(p.hours).toEqual([
      { time: '2026-10-31T13:00', temp: 29, prob: null, code: 2, rain: 0 },
      { time: '2026-10-31T14:00', temp: 30, prob: null, code: 95, rain: 4 }
    ])
    expect(p.days).toEqual([])
  })
  it('OpenWeather: unix to Manila, pop to percent, condition id to WMO, no rain field means 0 mm', () => {
    const p = parseOpenWeather(ow)!
    expect(p.now).toMatchObject({ time: '2026-10-31T13:06', temp: 31, feels: 38, code: 3, wind: 7.2, gust: 14.4, uv: 10 })
    expect(p.hours).toEqual([
      { time: '2026-10-31T13:00', temp: 31, prob: 30, code: 3, rain: 0 },
      { time: '2026-10-31T14:00', temp: 32, prob: 80, code: 65, rain: 5 }
    ])
    expect(p.days[0]).toMatchObject({ date: '2026-10-31', min: 26, max: 33, prob: 80, code: 63, sunrise: '2026-10-31T05:46', sunset: '2026-10-31T17:31' })
    expect(p.minutely).toHaveLength(60)
    expect(p.alerts?.[0]).toMatchObject({ source: 'PAGASA', event: 'Heavy rainfall warning', start: '2026-10-31T13:07' })
  })
  it('air: OpenWeather 1-5 index with words', () => {
    expect(parseAir(air)).toEqual({ index: 2, label: 'Fair', pm25: 12.4, pm10: 20.1 })
    expect(parseAir({ list: [] })).toBeNull()
  })
  it('a broken payload is null, not a crash', () => {
    for (const p of [parseOpenMeteo, parseMet, parseOpenWeather]) expect(p({ nope: 1 })).toBeNull()
  })
})

describe('blend', () => {
  const all: Series[] = [parseOpenMeteo(om)!, parseMet(met)!, parseOpenWeather(ow)!]
  it('takes the per-hour median and drops providers with no value; keeps the earlier hours of today', () => {
    const b = blend({ series: all, aqi: parseAir(air), sources: [] }, CELL, NOW)
    expect(b.hourly48.map((h) => h.time)).toEqual(['2026-10-31T12:00', '2026-10-31T13:00', '2026-10-31T14:00']) // 12:00 is past but today
    // 14:00: temps 31, 30, 32 -> 31; prob is the share of sources with >= 0.1 mm: rain 2, 4, 5 -> all three wet -> 100; rain -> 4; codes 61, 95, 65 -> 65
    expect(b.hourly48[2]).toEqual({ time: '2026-10-31T14:00', temp: 31, prob: 100, code: 65, rain: 4 })
    expect(b.now).toMatchObject({ time: '2026-10-31T13:07', temp: 30, humidity: 75, feels: 37 })
    expect(b.daily10[0]).toMatchObject({ date: '2026-10-31', min: 25.5, max: 32, prob: 70, code: 63, sunrise: '2026-10-31T05:45' })
    expect(b).toMatchObject({ tz: 'Asia/Manila', utcOffset: 28800, cell: CELL, alerts: [{ event: 'Heavy rainfall warning' }], aqi: { index: 2 } })
  })
  it('two providers: the more severe weather code, the mean of the two numbers', () => {
    const b = blend({ series: all.slice(0, 2), aqi: null, sources: [] }, CELL, NOW)
    expect(b.hourly48[2]).toEqual({ time: '2026-10-31T14:00', temp: 30.5, prob: 100, code: 95, rain: 3 }) // rain 2 and 4, both wet: 100
    expect(b.alerts).toEqual([])
  })
})

it('yesterday is dropped; today from midnight plus 48 hours ahead at most', () => {
  const hours = Array.from({ length: 80 }, (_, i) => ({ time: new Date(Date.parse('2026-10-30T16:00:00Z') + i * 3600_000).toISOString().slice(0, 13) + ':00', temp: 1, prob: null, code: null, rain: null }))
  const b = blend({ series: [{ id: 'open-meteo', now: null, hours, days: [] }], aqi: null, sources: [] }, CELL, NOW)
  expect(b.hourly48[0].time).toBe('2026-10-31T00:00') // series labelled 16:00Z..; labels are already Manila, so 2026-10-30T16:00 .. is yesterday
  expect(b.hourly48).toHaveLength(13 + 48) // 00:00..12:00 today, then 13:00 + 47
})

describe('next2h', () => {
  const hours = [{ time: '2026-10-31T13:00', temp: null, prob: null, code: null, rain: 0 }, { time: '2026-10-31T14:00', temp: null, prob: null, code: null, rain: 4 }, { time: '2026-10-31T15:00', temp: null, prob: null, code: null, rain: 2 }]
  it('first hour from OpenWeather minutely, second hour interpolated and flagged', () => {
    const slots = next2h(parseOpenWeather(ow)!.minutely, hours, NOW)
    expect(slots).toHaveLength(12)
    expect(slots[0]).toEqual({ time: '2026-10-31T13:00', mmh: 0, estimated: false }) // 13:00..13:09 all dry
    expect(slots[1]).toEqual({ time: '2026-10-31T13:10', mmh: 4.2, estimated: false }) // 13:10..13:19: 3 dry minutes, 7 at 6 mm/h
    expect(slots.slice(6).every((x) => x.estimated)).toBe(true)
  })
  it('without minutely every slot is interpolated between hour midpoints', () => {
    const slots = next2h(undefined, hours, NOW)
    expect(slots.every((x) => x.estimated)).toBe(true)
    expect(slots[0].mmh).toBe(0) // 13:05 is before the 13:30 midpoint
    expect(slots[6].mmh).toBe(2.3) // 14:05: 0 + 4 * 35/60
    expect(slots[11].mmh).toBe(3.2) // 14:55: 4 - 2 * 25/60
  })
})

describe('gather', () => {
  const res = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })
  const route = (ow401 = false) => vi.fn(async (u: string | URL | Request) => {
    const url = String(u)
    if (url.includes('open-meteo')) return res(om)
    if (url.includes('met.no')) return res(met, 200, { Expires: 'Sat, 31 Oct 2026 05:40:00 GMT' })
    if (url.includes('air_pollution')) return ow401 ? res({ cod: 401 }, 401) : res(air)
    return ow401 ? res({ cod: 401, message: 'Invalid API key' }, 401) : res(ow)
  })
  it('all three answer: three series, air quality, MET Expires kept', async () => {
    const f = route()
    const g = await gather(CELL, 'secret-key-123', f as unknown as typeof fetch, NOW, null)
    expect(g.series.map((x) => x.id)).toEqual(['open-meteo', 'met-norway', 'openweather'])
    expect(g.aqi?.index).toBe(2)
    expect(g.met?.expires).toBe('2026-10-31T05:40:00.000Z')
    const metCall = f.mock.calls.find((c) => String(c[0]).includes('met.no'))!
    expect(new Headers((metCall[1] as RequestInit).headers).get('User-Agent')).toMatch(/^FamilyBantay\/1\.0 \(\+/)
  })
  it('an inactive key (401) is "unavailable", never an error, and the key appears nowhere in the result', async () => {
    const g = await gather(CELL, 'secret-key-123', route(true) as unknown as typeof fetch, NOW, null)
    expect(g.series.map((x) => x.id)).toEqual(['open-meteo', 'met-norway'])
    expect(g.sources.find((x) => x.id === 'openweather')).toMatchObject({ ok: false, reason: 'key_inactive' })
    expect(g.aqi).toBeNull()
    expect(JSON.stringify(g)).not.toContain('secret-key-123')
  })
  it('no key: OpenWeather is never called', async () => {
    const f = route()
    const g = await gather(CELL, undefined, f as unknown as typeof fetch, NOW, null)
    expect(f.mock.calls.some((c) => String(c[0]).includes('openweathermap'))).toBe(false)
    expect(g.sources.find((x) => x.id === 'openweather')).toMatchObject({ ok: false, reason: 'no_key' })
  })
  it('MET is not asked again before its Expires', async () => {
    const f = route()
    const cached = { expires: '2026-10-31T05:40:00.000Z', series: parseMet(met)! }
    const g = await gather(CELL, undefined, f as unknown as typeof fetch, NOW, cached)
    expect(f.mock.calls.some((c) => String(c[0]).includes('met.no'))).toBe(false)
    expect(g.series.map((x) => x.id)).toEqual(['open-meteo', 'met-norway'])
  })
  it('a provider that throws or times out is dropped', async () => {
    const f = vi.fn(async (u: string | URL | Request) => { if (String(u).includes('met.no')) throw new Error('timeout'); return res(om) })
    const g = await gather(CELL, undefined, f as unknown as typeof fetch, NOW, null)
    expect(g.series.map((x) => x.id)).toEqual(['open-meteo'])
    expect(g.sources.find((x) => x.id === 'met-norway')).toMatchObject({ ok: false, reason: 'unreachable' })
  })
})
