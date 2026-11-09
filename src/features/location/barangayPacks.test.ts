import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetBarangayPacks, nearestBarangay } from './barangayPacks'

// 1 degree of latitude = 111.195 km (R 6371.0088), so 0.01 deg = 1.112 km.
const PACKS: Record<string, unknown[]> = {
  '9_123': [[9.5, 123.5, 'Alpha', 'Town1'], [9.53, 123.5, 'Bravo', 'Town1'], [9.9, 123.5, 'Delta', 'Town1']],
  '10_123': [[10.01, 123.5, 'Charlie', 'Town2']],
  '9_124': [[9.5, 124.002, 'Echo', 'Town3']],
  '8_123': [[8.999, 123.5, 'Sierra', 'Town4']],
  '9_122': [[9.5, 122.998, 'Whiskey', 'Town5']],
  '7_123': [[7.5, 123.5, '670', 'Manila']]
}
const json = (body: unknown) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body })
const html = () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new SyntaxError('html') } })
const httpErr = (status: number) => ({ ok: false, status, headers: new Headers(), json: async () => ({}) })
const INDEX = { format: 1, tiles: Object.fromEntries(Object.entries(PACKS).map(([k, v]) => [k, v.length])) }
let calls: string[]
let indexCalls: number
let broken: Record<string, () => unknown>
beforeEach(() => {
  _resetBarangayPacks()
  calls = []
  indexCalls = 0
  broken = {}
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/index.json')) { indexCalls++; return (broken.index ?? (() => json(INDEX)))() }
    const key = /barangays\/(.+)\.json$/.exec(url)![1]
    calls.push(key)
    if (broken[key]) return broken[key]()
    return key in PACKS ? json(PACKS[key]) : html() // a missing file on Cloudflare Pages answers index.html with 200
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
  it('near the south edge it reads the south tile: Sierra is 0.002 deg = 0.222 km', async () => {
    const r = await nearestBarangay(9.001, 123.5)
    expect(r?.name).toBe('Sierra'); expect(r?.km).toBeCloseTo(0.222, 2)
    expect(calls.sort()).toEqual(['8_123', '9_123'])
  })
  it('near the east edge it reads the east tile: Echo is 0.004 deg of lon at 9.5 N = 0.438 km', async () => {
    const r = await nearestBarangay(9.5, 123.998)
    expect(r?.name).toBe('Echo'); expect(r?.km).toBeCloseTo(0.438, 2)
  })
  it('near the west edge it reads the west tile: Whiskey is 0.003 deg of lon at 9.5 N = 0.329 km', async () => {
    const r = await nearestBarangay(9.5, 123.001)
    expect(r?.name).toBe('Whiskey'); expect(r?.km).toBeCloseTo(0.329, 2)
    expect(calls.sort()).toEqual(['9_122', '9_123'])
  })
  it('a small radius at the same edge point reads one tile only', async () => {
    await nearestBarangay(9.995, 123.5, { maxKm: 0.3 })
    expect(calls).toEqual(['9_123'])
  })
  it('a corner reads up to 4 tiles but only those listed in index.json (10_124 is not listed: never fetched)', async () => {
    expect(await nearestBarangay(9.999, 123.999, { maxKm: 1 })).toBeNull()
    expect(calls.sort()).toEqual(['10_123', '9_123', '9_124'])
  })
  it('reads index.json once for any number of lookups', async () => {
    await nearestBarangay(9.51, 123.5); await nearestBarangay(9.995, 123.5); await nearestBarangay(1, 1)
    expect(indexCalls).toBe(1)
  })
  it('a tile that is not listed is never fetched (the host would answer index.html with 200)', async () => {
    expect(await nearestBarangay(1.5, 1.5)).toBeNull()
    expect(calls).toEqual([])
  })
  it('an index.json answered as HTML (200) means no packs for the session: no tile is fetched', async () => {
    broken.index = html
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect(calls).toEqual([]); expect(indexCalls).toBe(1)
  })
  it('an HTTP 500 on a listed tile is an empty tile for the session (not retried)', async () => {
    broken['9_123'] = () => httpErr(500)
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect(calls).toEqual(['9_123'])
  })
  it('a listed tile answered as HTML (200) is empty, never parsed', async () => {
    broken['9_123'] = html
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
  })
  it('an HTTP 404 on index.json is no packs, no tile fetch', async () => {
    broken.index = () => httpErr(404)
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect(calls).toEqual([])
  })
  it('caches tiles in memory', async () => {
    await nearestBarangay(9.51, 123.5); await nearestBarangay(9.52, 123.5)
    expect(calls).toEqual(['9_123'])
  })
  it('a network failure on a tile gives null and is retried next time', async () => {
    let n = 0
    broken['9_123'] = () => { if (n++ === 0) throw new Error('offline'); return json(PACKS['9_123']) }
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect((await nearestBarangay(9.51, 123.5))?.name).toBe('Alpha')
  })
  it('a network failure on index.json gives null and the index is retried next time', async () => {
    let n = 0
    broken.index = () => { if (n++ === 0) throw new Error('offline'); return json(INDEX) }
    expect(await nearestBarangay(9.51, 123.5)).toBeNull()
    expect((await nearestBarangay(9.51, 123.5))?.name).toBe('Alpha')
    expect(indexCalls).toBe(2)
  })
  it('a bare-number name reads "Barangay 670"', async () => {
    expect((await nearestBarangay(7.5, 123.5))?.name).toBe('Barangay 670')
  })
  it('bad coordinates give null without fetching', async () => {
    expect(await nearestBarangay(NaN, 123)).toBeNull(); expect(calls).toEqual([]); expect(indexCalls).toBe(0)
  })
})
