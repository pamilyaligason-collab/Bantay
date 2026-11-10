import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { AIR_FRESH_MS, BANDS, airUrl, bandOf, getAir, pm25Mean } from './airQuality'

const lum = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i]! * v, 0)
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }

describe('Philippine AQI bands (DENR DAO 2020-14)', () => {
  it.each([[0, 1], [25, 1], [25.1, 2], [35, 2], [35.1, 3], [45, 3], [45.1, 4], [55, 4], [55.1, 5], [90, 5], [90.1, 6], [400, 6]])('%s ug/m3 is level %s', (pm, id) => {
    expect(bandOf(pm).id).toBe(id)
  })
  it('a mean is rounded to 0.1 first: 25.04 is Good, 25.06 is Fair', () => {
    expect(bandOf(25.04).id).toBe(1); expect(bandOf(25.06).id).toBe(2)
  })
  it('names, and a caution for levels 3 to 6 only', () => {
    expect(BANDS.map((b) => b.label)).toEqual(['Good', 'Fair', 'Unhealthy for Sensitive Groups', 'Very Unhealthy', 'Acutely Unhealthy', 'Emergency'])
    expect(BANDS.map((b) => b.say !== null)).toEqual([false, false, true, true, true, true])
  })
  it('chip text passes 4.5:1 on its tint', () => { for (const b of BANDS) expect(ratio(b.ink, b.bg), b.label).toBeGreaterThanOrEqual(4.5) })
})

const hours = (n: number, endHour: string, val: (i: number) => number | null) => {
  const end = Date.parse(`${endHour}:00:00Z`)
  return { time: Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 3600_000).toISOString().slice(0, 16)), pm2_5: Array.from({ length: n }, (_, i) => val(i)) }
}
describe('pm25Mean: 24 h mean up to now, unknown under 18 readings', () => {
  it('averages the last 24 hours up to the current hour and ignores later hours', () => {
    const h = hours(48, '2026-11-11T23', (i) => (i < 24 ? 100 : 10)) // 24 hours at 100, then 24 at 10
    expect(pm25Mean(h, '2026-11-11T23')).toBe(10)
    expect(pm25Mean(h, '2026-11-11T00')).toBe(96.3) // hand: (23 x 100 + 10) / 24 = 96.25, rounded to 0.1
  })
  it('exactly 18 readings is enough, 17 is unknown', () => {
    expect(pm25Mean(hours(24, '2026-11-10T12', (i) => (i < 18 ? 20 : null)), '2026-11-10T12')).toBe(20)
    expect(pm25Mean(hours(24, '2026-11-10T12', (i) => (i < 17 ? 20 : null)), '2026-11-10T12')).toBeNull()
  })
  it('missing arrays or a clock before all data is unknown, never 0', () => {
    expect(pm25Mean(undefined, '2026-11-10T12')).toBeNull()
    expect(pm25Mean(hours(24, '2026-11-10T12', () => 5), '2026-11-01T00')).toBeNull()
  })
})

describe('getAir (live path, fetch faked)', () => {
  const P = { lat: 9.65, lon: 123.85 }
  const NOW = Date.parse('2026-11-10T04:30:00Z') // 12:30 at +08:00
  const body = () => JSON.stringify({ utc_offset_seconds: 28800, hourly: hours(48, '2026-11-10T12', () => 30) })
  const F = (f: unknown) => f as typeof fetch
  beforeEach(async () => { await db.kv.clear() })
  it('asks Open-Meteo Air Quality for pm2_5 with a rounded position, and reads Fair', async () => {
    const f = vi.fn(async (_u: string) => new Response(body()))
    const r = await getAir({ lat: 9.6512, lon: 123.8499 }, F(f), NOW)
    expect(String(f.mock.calls[0]![0])).toBe(airUrl({ lat: 9.65, lon: 123.85 }))
    expect(String(f.mock.calls[0]![0])).toContain('hourly=pm2_5&past_days=1&forecast_days=1&timezone=auto')
    expect(r.air.mean).toBe(30); expect(bandOf(r.air.mean!).label).toBe('Fair')
  })
  it('a reading under 60 minutes old is reused; at 60 minutes there is a new request', async () => {
    const f = vi.fn(async (_u: string) => new Response(body()))
    await getAir(P, F(f), NOW)
    await getAir(P, F(f), NOW + AIR_FRESH_MS - 1)
    expect(f).toHaveBeenCalledTimes(1)
    await getAir(P, F(f), NOW + AIR_FRESH_MS)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('network failure: an older cache is returned as stale; past 6 hours it throws', async () => {
    await getAir(P, F(async () => new Response(body())), NOW)
    const bad = F(async () => { throw new Error('offline') })
    expect((await getAir(P, bad, NOW + 2 * 3600_000)).stale).toBe(true)
    await expect(getAir(P, bad, NOW + 7 * 3600_000)).rejects.toThrow()
  })
  it('too few hours: mean is null (unknown)', async () => {
    const f = async () => new Response(JSON.stringify({ utc_offset_seconds: 28800, hourly: hours(48, '2026-11-10T12', (i) => (i > 40 ? 30 : null)) }))
    expect((await getAir(P, F(f), NOW)).air.mean).toBeNull()
  })
})
