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
  it('PH outside any area and abroad say where you are', () => {
    expect(at(17.6, 121.7)).toBe('where you are')
    expect(at(35.68, 139.76)).toBe('where you are')
  })
  it('zone source keeps the zone short name', () => {
    expect(placeNameOf(resolvePlace({ gps: null, lastZone: 'conel' }) as never)).toBe('Conel')
  })
})
