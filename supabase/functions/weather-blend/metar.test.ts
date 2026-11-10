// @vitest-environment node
// METAR shape from aviationweather.gov, 2026-10-31 (RPVM 13:00Z: 28 °C).
import { describe, expect, it, vi } from 'vitest'
import { checkOf, memoJson, nearestStation, parseMetar, rainObserved, type StationPort, type StationRow, stationCheck, stationObs } from './metar.ts'

const NOW = Date.parse('2026-10-31T13:30:00Z')
const rpvm = [{ icaoId: 'RPVM', obsTime: Date.parse('2026-10-31T13:00:00Z') / 1000, temp: 28, rawOb: 'METAR RPVM 311300Z 23005KT 9999 TS FEW018CB 28/25 Q1014' }]
const LAPU = { lat: 10.31, lon: 123.95 } // Lapu-Lapu, about 3 km from Mactan airport

const port = (row: StationRow | null, body: unknown = rpvm) => {
  const writes: StationRow[] = []
  const p: StationPort = { read: vi.fn(async () => row), write: vi.fn(async (r) => { writes.push(r) }), fetchJson: vi.fn(async () => body) }
  return { p, writes }
}

describe('METAR check', () => {
  it('nearest station within 20 km only', () => {
    expect(nearestStation(LAPU)?.id).toBe('RPVM')
    expect(nearestStation({ lat: 6.11, lon: 125.17 })?.id).toBe('RPMR') // General Santos city
    expect(nearestStation({ lat: 9.65, lon: 123.88 })?.id).toBe('RPVT') // Dampas, Tagbilaran
    expect(nearestStation({ lat: 14.6, lon: 121.0 })).toBeNull() // Manila: no station listed
  })
  it('parses the latest observation; an old one is ignored', () => {
    expect(parseMetar(rpvm, NOW)).toEqual({ temp: 28, at: '2026-10-31T13:00:00.000Z' })
    expect(parseMetar(rpvm, NOW + 4 * 3600_000)).toBeNull()
    expect(parseMetar([], NOW)).toBeNull()
  })
  it('fetches, stores the observation per station, returns the check', async () => {
    const { p, writes } = port(null)
    const c = await stationCheck(p, LAPU, 29.4, NOW)
    expect(c).toEqual({ station: 'RPVM', name: 'Mactan-Cebu airport', observedAt: '2026-10-31T13:00:00.000Z', observedTemp: 28, forecastTemp: 29.4, bias: -1.4 })
    expect(writes[0]).toEqual({ station: 'RPVM', name: 'Mactan-Cebu airport', observed_at: '2026-10-31T13:00:00.000Z', temp_c: 28, updated_at: '2026-10-31T13:30:00.000Z' })
  })
  it('a row refreshed within the hour is reused without a request; the bias uses the forecast of this cell', async () => {
    const row: StationRow = { station: 'RPVM', name: 'Mactan-Cebu airport', observed_at: '2026-10-31T13:00:00.000Z', temp_c: 28, updated_at: '2026-10-31T13:10:00.000Z' }
    const { p } = port(row)
    expect((await stationCheck(p, LAPU, 30, NOW))?.bias).toBe(-2)
    expect((await stationCheck(p, LAPU, 27.5, NOW))?.bias).toBe(0.5)
    expect(p.fetchJson).not.toHaveBeenCalled()
  })
  it('no recent METAR (Tagbilaran today): no check, nothing written', async () => {
    const { p, writes } = port(null, [])
    expect(await stationCheck(p, { lat: 9.65, lon: 123.88 }, 30, NOW)).toBeNull()
    expect(writes).toEqual([])
  })
  it('rain reading and station check share ONE fetch of the same METAR, each with its own age rule', async () => {
    const raw = vi.fn(async () => rpvm) // 30 min old: fresh for both rules
    const fetchJson = memoJson(raw)
    const { p } = port(null)
    p.fetchJson = fetchJson
    const [rain, obs] = await Promise.all([rainObserved(fetchJson, LAPU, NOW), stationObs(p, LAPU, NOW)])
    expect(raw).toHaveBeenCalledTimes(1)
    expect(rain).toMatchObject({ value: true, source: 'observed', ageMin: 30, station: 'Mactan-Cebu airport' }) // TS group
    expect(checkOf(obs, 29.4)?.bias).toBe(-1.4)
    // 2 h old: too old for rain (90 min), still fine for the temperature check (3 h)
    const later = NOW + 90 * 60_000
    const f2 = memoJson(vi.fn(async () => rpvm))
    expect(await rainObserved(f2, LAPU, later)).toBeNull()
    expect(checkOf(await stationObs({ ...port(null).p, fetchJson: f2 }, LAPU, later), 30)?.observedTemp).toBe(28)
  })
  it('checkOf is null without a row or a forecast temperature', () => {
    expect(checkOf(null, 30)).toBeNull()
    expect(checkOf({ station: 'RPVM', name: 'x', observed_at: 'x', temp_c: 28, updated_at: 'x' }, null)).toBeNull()
  })
})
