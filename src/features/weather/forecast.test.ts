import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { placeTimezone } from '../location/place'
import { toWx } from '../today/weather'
import { openMeteoFixture as fixture } from './fixture'
import { clockIn, forecastKey, forecastUrl, getForecast, hoursFrom, nowLocal, parseForecast, pruneForecasts, readCached } from './forecast'

const P = { lat: 9.645705, lon: 123.877951 }
const NOW = new Date('2026-10-20T05:00:00Z') // 13:00 in Manila
const ok = (j: unknown) => vi.fn(async () => new Response(JSON.stringify(j), { status: 200 }))

beforeEach(async () => { await db.kv.clear() })

describe('request', () => {
  const u = new URL(forecastUrl(P))
  it('is one Open-Meteo forecast call with every field the screen needs', () => {
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(u.searchParams.get('current')!.split(',')).toEqual(['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'uv_index'])
    expect(u.searchParams.get('hourly')!.split(',')).toEqual(['temperature_2m', 'precipitation_probability', 'weather_code'])
    expect(u.searchParams.get('daily')!.split(',')).toEqual(['weather_code', 'temperature_2m_min', 'temperature_2m_max', 'precipitation_probability_max', 'uv_index_max', 'sunrise', 'sunset'])
  })
  it('asks for 7 days in the place time zone, not Manila', () => {
    expect(u.searchParams.get('forecast_days')).toBe('7')
    expect(u.searchParams.get('timezone')).toBe('auto')
  })
  it('sends the location rounded to 2 decimals', () => {
    expect(u.searchParams.get('latitude')).toBe('9.65')
    expect(u.searchParams.get('longitude')).toBe('123.88')
  })
})

describe('parse', () => {
  it('reads current, 7 daily rows and the hourly list', () => {
    const fc = parseForecast(fixture({ now: NOW }), NOW.toISOString())!
    expect(fc.current).toMatchObject({ temp: 33, humidity: 68, feels: 42, wind: 9, gust: 18, uv: 9, code: 2 })
    expect(fc.daily).toHaveLength(7)
    expect(fc.hourly).toHaveLength(168)
    expect(fc.tz).toBe('Asia/Manila')
  })
  it('unknown numbers are null, never 0', () => {
    const j = fixture({ now: NOW }) as { current: Record<string, unknown> }
    j.current.relative_humidity_2m = 'x'
    delete j.current.uv_index
    const fc = parseForecast(j, NOW.toISOString())!
    expect(fc.current.humidity).toBeNull()
    expect(fc.current.uv).toBeNull()
  })
  it('a broken answer is null', () => { expect(parseForecast({}, 'x')).toBeNull() })
  it('a thin answer (temperature and day chance only) still gives Today its numbers', () => {
    const fc = parseForecast({ current: { time: '2026-10-20T10:00', temperature_2m: 34.2, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }, 'x')!
    expect(toWx(fc)).toMatchObject({ temp: 34.2, rainPct: 70, words: 'partly cloudy' })
  })
})

describe('cache and offline', () => {
  it('stores the forecast per place with the fetched-at time', async () => {
    await getForecast(P, ok(fixture({ now: NOW })), { now: NOW.getTime() })
    const row = (await db.kv.get(forecastKey(P)))?.value as { fetchedAt: string }
    expect(row.fetchedAt).toBe(NOW.toISOString())
    const other = { lat: 6.2, lon: 125.19 }
    expect(await readCached(other, NOW.getTime())).toBeNull()
  })
  it('a reading under 10 minutes old is reused without a request', async () => {
    await getForecast(P, ok(fixture({ now: NOW })), { now: NOW.getTime() })
    const f2 = vi.fn()
    const r = await getForecast(P, f2 as unknown as typeof fetch, { now: NOW.getTime() + 5 * 60_000 })
    expect(f2).not.toHaveBeenCalled()
    expect(r.fromCache).toBe(false)
  })
  it('offline: the last forecast is shown and flagged as cached, with its time', async () => {
    await getForecast(P, ok(fixture({ now: NOW })), { now: NOW.getTime() })
    const down = vi.fn(async () => { throw new TypeError('offline') })
    const later = NOW.getTime() + 3 * 3600_000
    const r = await getForecast(P, down as unknown as typeof fetch, { now: later })
    expect(r.fromCache).toBe(true)
    expect(r.fc.fetchedAt).toBe(NOW.toISOString())
    expect(clockIn(r.fc.fetchedAt, r.fc.tz)).toBe('1:00 PM')
  })
  it('offline with nothing cached throws, and a day-old cache is not shown', async () => {
    const down = (async () => { throw new TypeError('offline') }) as unknown as typeof fetch
    await expect(getForecast(P, down, { now: NOW.getTime() })).rejects.toThrow()
    await db.kv.put({ key: forecastKey(P), value: parseForecast(fixture({ now: NOW }), NOW.toISOString()) })
    await expect(getForecast(P, down, { now: NOW.getTime() + 25 * 3600_000 })).rejects.toThrow()
  })
  it('a failed request with HTTP 500 falls back to the cache', async () => {
    await getForecast(P, ok(fixture({ now: NOW })), { now: NOW.getTime() })
    const bad = vi.fn(async () => new Response('', { status: 500 }))
    const r = await getForecast(P, bad as unknown as typeof fetch, { now: NOW.getTime() + 3600_000 })
    expect(r.fromCache).toBe(true)
  })
})

describe('time zone', () => {
  it('place-local clock comes from the forecast offset, so a member abroad sees the place time', () => {
    const fc = parseForecast(fixture({ now: NOW, offsetS: -5 * 3600, tz: 'America/Chicago' }), NOW.toISOString())!
    expect(nowLocal(fc, NOW.getTime())).toBe('2026-10-20T00:00')
    expect(clockIn(NOW.toISOString(), fc.tz)).toBe('12:00 AM')
    expect(hoursFrom(fc, 3, NOW.getTime()).map((h) => h.time.slice(11))).toEqual(['00:00', '01:00', '02:00'])
  })
  it('placeTimezone: the reported zone, else Manila inside the Philippines, else the phone', () => {
    expect(placeTimezone(P)).toBe('Asia/Manila')
    expect(placeTimezone({ lat: 32.8, lon: -96.8 })).toBeUndefined()
    expect(placeTimezone({ lat: 32.8, lon: -96.8 }, 'America/Chicago')).toBe('America/Chicago')
  })
  it('Today keeps the place wall clock: Wx hourly times are the place time, with its offset and zone, not Manila', () => {
    const fc = parseForecast(fixture({ now: NOW, offsetS: -5 * 3600, tz: 'America/Chicago' }), NOW.toISOString())!
    const wx = toWx(fc)
    expect(wx.temp).toBe(33)
    expect(wx.hourly!.time[0]).toBe('2026-10-20T00:00') // Chicago time, not Manila
    expect(wx).toMatchObject({ utcOffset: -5 * 3600, tz: 'America/Chicago', offline: false })
    expect(wx.rainPct).toBe(30)
  })
})

describe('forecast cache size', () => {
  it('keeps the 5 most recently fetched places and drops the oldest', async () => {
    for (let i = 0; i < 7; i++) {
      const at = { lat: 10 + i, lon: 120 }
      await getForecast(at, ok(fixture({ now: NOW, offsetS: 8 * 3600 })), { now: NOW.getTime() + i * 60_000 })
      await new Promise((r) => setTimeout(r, 15)) // the prune runs after the write
    }
    await pruneForecasts() // the background prune may still be running under load: settle it deterministically
    const keys = (await db.kv.toArray()).map((r) => r.key).filter((k) => k.startsWith('weather.forecast.')).sort()
    expect(keys).toHaveLength(5)
    expect(keys).not.toContain(forecastKey({ lat: 10, lon: 120 }))
    expect(keys).not.toContain(forecastKey({ lat: 11, lon: 120 }))
    expect(keys).toContain(forecastKey({ lat: 16, lon: 120 }))
  })
})
