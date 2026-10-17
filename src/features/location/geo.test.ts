import { describe, expect, it } from 'vitest'
import { DAMPAS, distanceKm } from './geo'

describe('distanceKm', () => {
  it('is zero for the same point', () => expect(distanceKm(DAMPAS, DAMPAS)).toBe(0))
  it('Dampas to Tagbilaran City Hall area is under 5 km', () => {
    expect(distanceKm(DAMPAS, { lat: 9.6477, lon: 123.8554 })).toBeLessThan(5)
  })
  it('matches a known long distance (Manila to Cebu ~571 km)', () => {
    const d = distanceKm({ lat: 14.5995, lon: 120.9842 }, { lat: 10.3157, lon: 123.8854 })
    expect(d).toBeGreaterThan(560)
    expect(d).toBeLessThan(585)
  })
  it('is symmetric', () => {
    const a = { lat: 9.6, lon: 123.8 }, b = { lat: 6.1, lon: 125.2 }
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9)
  })
})

describe('home default', () => {
  it('is Dampas, Tagbilaran', () => {
    expect(DAMPAS.lat).toBe(9.645705)
    expect(DAMPAS.lon).toBe(123.877951)
  })
})
