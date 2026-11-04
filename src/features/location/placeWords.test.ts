import { describe, expect, it } from 'vitest'
import { placeWords } from './placeWords'

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
    expect(placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 }, fixAt: NOW - 3 * 3_600_000 }, NOW)).toEqual({ title: 'Tagbilaran · last known, 3 h ago', stale: true })
  })
  it('age in minutes and days', () => {
    const w = (ms: number) => placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 }, fixAt: NOW - ms }, NOW).title
    expect(w(5 * 60_000)).toBe('Tagbilaran · last known, 5 min ago')
    expect(w(2 * 86_400_000)).toBe('Tagbilaran · last known, 2 d ago')
  })
  it('a fix with no time still says last known', () => {
    expect(placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 } }, NOW).title).toBe('Tagbilaran · last known')
  })
  it('no fix ever: the home area', () => {
    expect(placeWords({ source: 'zone', zone: 'conel', picked: false }, NOW)).toEqual({ title: 'Conel · your home area', stale: false })
  })
  it('a zone picked by hand: the zone name', () => {
    expect(placeWords({ source: 'zone', zone: 'conel', picked: true }, NOW).title).toBe('Conel')
    expect(placeWords({ source: 'zone', zone: 'conel' }, NOW).title).toBe('Conel')
  })
  it('abroad: Away', () => {
    expect(placeWords({ source: 'gps-abroad', zone: 'conel', weather: { lat: 35.68, lon: 139.76 } }, NOW).title).toBe('Away · Conel')
  })
  it('unsettled (first position still being found): where you are, never a home zone', () => {
    expect(placeWords({ source: 'zone', zone: 'conel', picked: false, settled: false }, NOW)).toEqual({ title: 'where you are', stale: false })
    expect(placeWords({ source: 'zone', zone: 'conel', picked: true, settled: false }, NOW).title).toBe('where you are')
  })
  it('null: where you are', () => {
    expect(placeWords(null, NOW)).toEqual({ title: 'where you are', stale: false })
  })
})
