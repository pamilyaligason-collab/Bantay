import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetBarangayPacks, nearestBarangay } from './barangayPacks'

// 1 degree of latitude = 111.195 km (R 6371.0088), so 0.01 deg = 1.112 km.
const PACKS: Record<string, unknown[]> = {
  '9_123': [[9.5, 123.5, 'Alpha', 'Town1'], [9.53, 123.5, 'Bravo', 'Town1'], [9.9, 123.5, 'Delta', 'Town1']],
  '10_123': [[10.01, 123.5, 'Charlie', 'Town2']],
  '9_124': [[9.5, 124.002, 'Echo', 'Town3']]
}
let calls: string[]
beforeEach(() => {
  _resetBarangayPacks()
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = /barangays\/(.+)\.json$/.exec(url)![1]
    calls.push(key)
    return key in PACKS ? { ok: true, status: 200, json: async () => PACKS[key] } : { ok: false, status: 404, json: async () => ({}) }
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('nearestBarangay', () => {
  it('picks the nearest point: 0.01 deg to Alpha (1.112 km), 0.02 deg to Bravo', async () => {
    const r = await nearestBarangay(9.51, 123.5)
    expect(r?.name).toBe('Alpha'); expect(r?.town).toBe('Town1'); expect(r?.km).toBeCloseTo(1.112, 2)
    expect(calls).toEqual(['9_123']) // mid-tile: one fetch only
  })
  it('nothing within the radius gives null (Bravo is 0.07 deg = 7.78 km away)', async () => {
    expect(await nearestBarangay(9.6, 123.5)).toBeNull()
  })
  it('maxKm widens the search: 7.78 km needs maxKm 8', async () => {
    expect((await nearestBarangay(9.6, 123.5, { maxKm: 8 }))?.name).toBe('Bravo')
  })
  it('near the north edge it also reads the next tile: Charlie 0.015 deg = 1.668 km beats Delta 10.6 km', async () => {
    const r = await nearestBarangay(9.995, 123.5)
    expect(r?.name).toBe('Charlie'); expect(r?.km).toBeCloseTo(1.668, 2)
    expect(calls.sort()).toEqual(['10_123', '9_123'])
  })
  it('near the east edge it reads the east tile: Echo is 0.004 deg of lon at 9.5 N = 0.438 km', async () => {
    const r = await nearestBarangay(9.5, 123.998)
    expect(r?.name).toBe('Echo'); expect(r?.km).toBeCloseTo(0.438, 2)
  })
  it('a small radius at the same edge point reads one tile only', async () => {
    await nearestBarangay(9.995, 123.5, { maxKm: 0.3 })
    expect(calls).toEqual(['9_123'])
  })
  it('a corner reads up to 4 tiles; a missing tile (404) counts as empty', async () => {
    expect(await nearestBarangay(9.999, 123.999, { maxKm: 1 })).toBeNull()
    expect(calls.sort()).toEqual(['10_123', '10_124', '9_123', '9_124'])
  })
  it('caches tiles in memory', async () => {
    await nearestBarangay(9.51, 123.5); await nearestBarangay(9.52, 123.5)
    expect(calls).toEqual(['9_123'])
  })
  it('a network failure gives null and is retried next time', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, status: 200, json: async () => PACKS['9_123'] })
    vi.stubGlobal('fetch', f)
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect((await nearestBarangay(9.51, 123.5))?.name).toBe('Alpha')
  })
  it('bad coordinates give null without fetching', async () => {
    expect(await nearestBarangay(NaN, 123)).toBeNull(); expect(calls).toEqual([])
  })
})
