import { beforeEach, describe, expect, it, vi } from 'vitest'
import { placeWords } from './placeWords'
import { _resetPackPlaces, packVersion } from './nearestPlace'
import { nearestBarangay } from './barangayPacks'

vi.mock('./barangayPacks', () => ({ nearestBarangay: vi.fn(async () => null) }))
const lookup = vi.mocked(nearestBarangay)
beforeEach(() => { _resetPackPlaces(); lookup.mockReset(); lookup.mockResolvedValue(null) })
const tick = () => new Promise((r) => setTimeout(r, 0))

const NOW = Date.parse('2026-11-02T12:00:00Z')
describe('placeWords', () => {
  it('GPS in a named area gives the area, never "Near you"', () => {
    expect(placeWords({ source: 'gps', zone: 'conel', weather: { lat: 7.07, lon: 125.61 } }, NOW)).toEqual({ title: 'Davao', stale: false })
  })
  it('GPS 400 km from every home zone still names where the phone is', () => {
    const w = placeWords({ source: 'gps', zone: 'conel', weather: { lat: 10.3157, lon: 123.8854 } }, NOW)
    expect(w.title).toBe('Cebu City'); expect(w.title).not.toMatch(/Near you/)
  })
  it('GPS outside every named area says where you are', () => {
    expect(placeWords({ source: 'gps', zone: 'dampas', weather: { lat: 17.6, lon: 121.7 } }, NOW).title).toBe('where you are')
  })
  it('a 3 h old fix says last known, 3 h ago, and is stale', () => {
    expect(placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 }, fixAt: NOW - 3 * 3_600_000 }, NOW)).toEqual({ title: 'Tagbilaran · last known, 3 hours ago', stale: true })
  })
  it('age in minutes and days', () => {
    const w = (ms: number) => placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 }, fixAt: NOW - ms }, NOW).title
    expect(w(5 * 60_000)).toBe('Tagbilaran · last known, 5 minutes ago')
    expect(w(2 * 86_400_000)).toBe('Tagbilaran · last known, 2 days ago')
  })
  it('a fix with no time still says last known', () => {
    expect(placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 } }, NOW).title).toBe('Tagbilaran · last known')
  })
  it('no fix ever: the home area', () => {
    expect(placeWords({ source: 'zone', zone: 'conel', picked: false }, NOW)).toEqual({ title: 'Conel, General Santos · your home area', stale: false })
  })
  it('a zone picked by hand: the zone name', () => {
    expect(placeWords({ source: 'zone', zone: 'conel', picked: true }, NOW).title).toBe('Conel, General Santos')
    expect(placeWords({ source: 'zone', zone: 'conel' }, NOW).title).toBe('Conel, General Santos')
  })
  it('abroad: Away', () => {
    expect(placeWords({ source: 'gps-abroad', zone: 'conel', weather: { lat: 35.68, lon: 139.76 } }, NOW).title).toBe('Away · Conel, General Santos')
  })
  it('unsettled (first position still being found): where you are, never a home zone', () => {
    expect(placeWords({ source: 'zone', zone: 'conel', picked: false, settled: false }, NOW)).toEqual({ title: 'where you are', stale: false })
    expect(placeWords({ source: 'zone', zone: 'conel', picked: true, settled: false }, NOW).title).toBe('where you are')
  })
  it('null: where you are', () => {
    expect(placeWords(null, NOW)).toEqual({ title: 'where you are', stale: false })
  })

  it('abroad and home zones never start a pack lookup', () => {
    placeWords({ source: 'gps-abroad', zone: 'conel', weather: { lat: 35.68, lon: 139.76 } }, NOW)
    placeWords({ source: 'zone', zone: 'conel' }, NOW)
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('placeWords with the offline barangay lookup (D-181)', () => {
  const fix = { source: 'gps', zone: 'conel', weather: { lat: 10.3157, lon: 123.8854 }, accuracy: 30 }
  it('slow lookup: the area wording first, one lookup only however often it renders, then <barangay>, <town>', async () => {
    let done: (v: { name: string; town: string; km: number } | null) => void = () => {}
    lookup.mockReturnValue(new Promise((r) => { done = r }))
    expect(placeWords(fix, NOW).title).toBe('Cebu City')
    expect(placeWords(fix, NOW).title).toBe('Cebu City')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(10.3157, 123.8854)
    const v0 = packVersion()
    done({ name: 'Lahug', town: 'Cebu City', km: 0.4 })
    await tick()
    expect(packVersion()).toBe(v0 + 1)
    expect(placeWords(fix, NOW).title).toBe('Lahug, Cebu')
    expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('resolved: last known keeps the same place and the age', async () => {
    lookup.mockResolvedValue({ name: 'Lahug', town: 'Cebu City', km: 0.4 })
    placeWords(fix, NOW); await tick()
    expect(placeWords({ ...fix, source: 'last', fixAt: NOW - 3 * 3_600_000 }, NOW)).toEqual({ title: 'Lahug, Cebu · last known, 3 hours ago', stale: true })
  })
  it('empty town: the barangay name alone', async () => {
    lookup.mockResolvedValue({ name: 'Barangay 670', town: '', km: 0.1 })
    placeWords(fix, NOW); await tick()
    expect(placeWords(fix, NOW).title).toBe('Barangay 670')
  })
  it('nothing found (or offline and not cached): the area wording stays, no re-render signal, and no lookup loop within 10 minutes', async () => {
    const v0 = packVersion()
    expect(placeWords(fix, NOW).title).toBe('Cebu City'); await tick()
    expect(placeWords(fix, NOW + 60_000).title).toBe('Cebu City')
    expect(packVersion()).toBe(v0)
    expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('a miss is asked again after 10 minutes (back online)', async () => {
    placeWords(fix, NOW); await tick()
    lookup.mockResolvedValue({ name: 'Lahug', town: 'Cebu City', km: 0.4 })
    placeWords(fix, NOW + 11 * 60_000); await tick()
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(placeWords(fix, NOW + 11 * 60_000).title).toBe('Lahug, Cebu')
  })
  it('a rough fix is never given a barangay: no lookup, the area line stays', () => {
    expect(placeWords({ ...fix, accuracy: 5000 }, NOW)).toEqual({ title: 'Cebu City', approx: true, stale: false })
    expect(lookup).not.toHaveBeenCalled()
  })
  it('a failing lookup is the same as nothing found', async () => {
    lookup.mockRejectedValue(new Error('boom'))
    expect(placeWords(fix, NOW).title).toBe('Cebu City'); await tick()
    expect(placeWords(fix, NOW).title).toBe('Cebu City')
  })
})
