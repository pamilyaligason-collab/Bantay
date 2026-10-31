import { describe, expect, it } from 'vitest'
import { alertRef, inPhilippines, resolvePlace } from './place'
const TAG = { lat: 9.65, lon: 123.85 }, GENSAN = { lat: 6.11, lon: 125.17 }, CEBU = { lat: 10.31, lon: 123.89 }, TOKYO = { lat: 35.68, lon: 139.76 }
describe('resolvePlace (D-33)', () => {
  it('weather follows GPS, zone = nearest home zone in PH', () => {
    expect(resolvePlace({ gps: GENSAN, lastZone: 'dampas' })).toEqual({ weather: GENSAN, zone: 'conel', source: 'gps' })
    expect(resolvePlace({ gps: CEBU, lastZone: 'conel' })).toEqual({ weather: CEBU, zone: 'dampas', source: 'gps' })
  })
  it('outside PH keeps the last chosen zone for zone data', () => {
    expect(resolvePlace({ gps: TOKYO, lastZone: 'conel' })).toEqual({ weather: TOKYO, zone: 'conel', source: 'gps-abroad' })
  })
  it('no GPS uses the last chosen zone for both', () => {
    const r = resolvePlace({ gps: null, lastZone: 'conel' })
    expect(r.zone).toBe('conel'); expect(r.source).toBe('zone'); expect(r.weather.lat).toBeCloseTo(6.2015, 3)
  })
  it('alertRef: Tokyo ranks warnings from the picked zone, never the foreign point', () => {
    const r = alertRef(resolvePlace({ gps: TOKYO, lastZone: 'conel' }))
    expect(r.lat).toBeCloseTo(6.2015, 3)
    expect(alertRef(resolvePlace({ gps: GENSAN, lastZone: 'dampas' }))).toEqual(GENSAN)
    expect(alertRef(resolvePlace({ gps: null, lastZone: 'dampas' })).lat).toBeCloseTo(9.6457, 3)
  })
  it('PH box', () => { expect(inPhilippines(TAG)).toBe(true); expect(inPhilippines(TOKYO)).toBe(false) })
})

describe('resolvePlace last known fix (D-105)', () => {
  it('a stale fix is source last, still weather and zone from the fix', () => {
    expect(resolvePlace({ gps: { lat: 9.65, lon: 123.85, stale: true }, lastZone: 'conel' })).toEqual({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 } })
  })
  it('alertRef treats last like gps', () => {
    expect(alertRef(resolvePlace({ gps: { lat: 9.65, lon: 123.85, stale: true }, lastZone: 'conel' }))).toEqual({ lat: 9.65, lon: 123.85 })
  })
})
