import { describe, expect, it } from 'vitest'
import { DAMPAS, distanceKm, HOME_ZONES, HOTLINE_AREAS, pickLocalSet, type CircleArea } from './geo'

describe('pickLocalSet (PART-3 4.1)', () => {
  const at = (p: { lat: number; lon: number }, areas?: readonly CircleArea[]) => { const r = pickLocalSet(p, areas); return r.where === 'area' ? r.area.id : r.where }
  it('is the area when inside exactly one', () => {
    expect(at({ lat: 6.1164, lon: 125.1716 })).toBe('gensan')
    expect(at({ lat: 6.2015, lon: 125.1878 })).toBe('gensan') // Conel
    expect(at({ lat: 9.645705, lon: 123.877951 })).toBe('tagbilaran') // Dampas
    expect(at({ lat: 7.19, lon: 125.45 })).toBe('davao')
    expect(at({ lat: 10.3157, lon: 123.8854 })).toBe('cebu')
    expect(at({ lat: 14.5995, lon: 120.9842 })).toBe('manila')
  })
  it('both home zones fall in a hotline area', () => {
    expect(HOME_ZONES.map((z) => at(z))).toEqual(['tagbilaran', 'gensan'])
  })
  it('uses 30 km for cities and 25 km for Manila', () => {
    expect(at({ lat: 6.1164 + 29 / 111.2, lon: 125.1716 })).toBe('gensan')
    expect(at({ lat: 6.1164 + 31 / 111.2, lon: 125.1716 })).toBe('ph')
    expect(at({ lat: 14.5995 + 24 / 111.2, lon: 120.9842 })).toBe('manila')
    expect(at({ lat: 14.5995 + 26 / 111.2, lon: 120.9842 })).toBe('ph')
    expect(HOTLINE_AREAS.filter((a) => a.kind === 'circle').map((a) => (a as CircleArea).radiusKm)).toEqual([30, 30, 30, 30, 25])
  })
  it('picks the nearest centre when two circles overlap, whichever order they are listed in', () => {
    const a: CircleArea = { id: 'a', name: 'A', kind: 'circle', lat: 10, lon: 124, radiusKm: 60 }
    const b: CircleArea = { id: 'b', name: 'B', kind: 'circle', lat: 10.5, lon: 124, radiusKm: 60 }
    expect(at({ lat: 10.1, lon: 124 }, [a, b])).toBe('a')
    expect(at({ lat: 10.1, lon: 124 }, [b, a])).toBe('a')
    expect(at({ lat: 10.4, lon: 124 }, [a, b])).toBe('b')
  })
  it('Texas box, cities inside', () => {
    expect(at({ lat: 29.76, lon: -95.37 })).toBe('texas') // Houston
    expect(at({ lat: 32.78, lon: -96.8 })).toBe('texas') // Dallas
    expect(at({ lat: 31.76, lon: -106.49 })).toBe('texas') // El Paso
  })
  it('Philippines outside all areas, and abroad that is not Texas', () => {
    expect(at({ lat: 17.6, lon: 121.7 })).toBe('ph') // Tuguegarao
    expect(at({ lat: 12, lon: 122 })).toBe('ph')
    expect(at({ lat: 1.35, lon: 103.82 })).toBe('abroad') // Singapore
    expect(at({ lat: 25.2, lon: 55.27 })).toBe('abroad') // Dubai
    expect(at({ lat: 34.05, lon: -118.24 })).toBe('abroad') // Los Angeles
    expect(at({ lat: 0, lon: 0 })).toBe('abroad')
  })
})

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
