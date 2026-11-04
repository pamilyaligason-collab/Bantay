// @vitest-environment node
// METAR shape from aviationweather.gov, 2026-10-31 (RPVM 13:00Z: 28 °C).
import { describe, expect, it, vi } from 'vitest'
import { nearestStation, parseMetar, type StationPort, type StationRow, stationCheck } from './metar.ts'

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
})
