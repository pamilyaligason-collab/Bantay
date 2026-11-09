import { describe, expect, it } from 'vitest'
import { resolvePlace } from '../location/place'
import { placeNameOf } from './placeName'

const at = (lat: number, lon: number) => placeNameOf(resolvePlace({ gps: { lat, lon }, lastZone: 'dampas' }) as never)
describe('placeNameOf', () => {
  it('names the area the phone is in', () => {
    expect(at(6.11, 125.17)).toBe('General Santos')
    expect(at(9.65, 123.85)).toBe('Tagbilaran')
    expect(at(14.6, 120.98)).toBe('Manila')
  })
  it('PH outside any area says where you are; abroad says Away plus the zone (S4, one wording)', () => {
    expect(at(17.6, 121.7)).toBe('where you are')
    expect(at(35.68, 139.76)).toBe('Away · Dampas, Tagbilaran')
  })
  it('zone source keeps the zone short name', () => {
    expect(placeNameOf(resolvePlace({ gps: null, lastZone: 'conel' }) as never)).toBe('Conel, General Santos')
  })
  it('a last known fix says so', () => {
    expect(placeNameOf(resolvePlace({ gps: { lat: 9.65, lon: 123.85, stale: true }, lastZone: 'dampas' }) as never)).toBe('Tagbilaran · last known')
  })
})
