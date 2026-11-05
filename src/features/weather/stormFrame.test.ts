import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { FRAME, MARGIN, MARGIN_BOTTOM, stormFrame } from './stormFrame'

const here = { lat: 10, lon: 124 } // invented place
const tc = (id: string, lat: number | null, lon: number | null) => ({ id: `gdacs-TC-${id}`, kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone SAMPLE', what: '', where: '', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: '2026-11-05T00:00:00Z', lat, lon, bulletin: '' }) as Alert
const signal = { id: 'tcws-1', kind: 'tcws', level: 'Signal No. 2', title: 'Wind signal', what: '', where: '', when: '', doNow: '', source: 'PAGASA', sourceUrl: null, issuedAt: '2026-11-05T00:00:00Z', lat: null, lon: null, bulletin: '' } as unknown as Alert

describe('stormFrame (D-128 rule 6): the place and the nearest storm inside the 324 x 240 frame less 24 px at the top and sides and 70 px at the bottom (the Windy controls)', () => {
  // Web Mercator, 256 px tiles: a map is 256 * 2^zoom px round. Room is 276 px wide, 146 px tall (y 24 to 170); the map is centred 23 px south of the midpoint so that band is centred on the two points.
  it('the frame and margin are the ones the maths below uses', () => {
    expect([FRAME.w - 2 * MARGIN, FRAME.h - MARGIN - MARGIN_BOTTOM]).toEqual([276, 146])
  })
  it('near storm: 2 degrees of longitude is 182 px at zoom 7 (364 at zoom 8, too wide), so zoom 7, on the midpoint longitude and 23 px south of it: 23 / 92.4 px per degree of latitude (32768 / 360 / cos 10) is 0.249, so 9.75', () => {
    expect(stormFrame([tc('1', 10, 126)], here)).toEqual({ lat: 9.75, lon: 125, zoom: 7, alone: false })
  })
  it('11 degrees north (10N to 21N) is 130 px tall at zoom 4 (fits 146) and 260 at zoom 5, so zoom 4, centred about 13.6N: the 15.5N midpoint less 23 px', () => {
    const f = stormFrame([tc('2', 21, 124)], here)
    expect([f.zoom, f.lon, f.alone]).toEqual([4, 124, false])
    expect(f.lat).toBeCloseTo(13.62, 1)
  })
  it('13.5 degrees north (10N to 23.5N) is 162 px tall at zoom 4: over 146, so zoom 3 (81 px)', () => {
    expect(stormFrame([tc('2b', 23.5, 124)], here)).toMatchObject({ zoom: 3, alone: false })
  })
  it('the Dampas case: 9.65N to 31.5N is 266 px tall at zoom 4 (does not fit 146) and 133 px at zoom 3, so zoom 3, centred about 17.1N (Mercator midpoint 20.97N less 23 px). The place then sits 43.5 px under the centre, at y 163.5: above the time bubble at 176', () => {
    const f = stormFrame([tc('3', 31.5, 123.88)], { lat: 9.65, lon: 123.88 })
    expect([f.zoom, f.lon, f.alone]).toEqual([3, 123.88, false])
    expect(f.lat).toBeCloseTo(17.1, 1)
  })
  it('the nearest of two storms wins, not the newest', () => {
    expect(stormFrame([tc('2', 23.5, 124), tc('1', 10, 126)], here)).toMatchObject({ zoom: 7 })
  })
  it('a storm with no position, or a signal only, or nothing: the place alone at zoom 5, not flagged', () => {
    for (const a of [[tc('4', null, null)], [signal], []]) expect(stormFrame(a, here)).toEqual({ lat: 10, lon: 124, zoom: 5, alone: false })
  })
  it('too wide for zoom 3: 48 degrees is 273 px (fits 276), 49 degrees is 279 px, so the place alone and flagged', () => {
    const f = stormFrame([tc('5', 10, 172)], here) // 23 px south at zoom 3 is 23 / (2048 / 360 / cos 10) = 3.98 degrees: 6.02N
    expect([f.lon, f.zoom, f.alone]).toEqual([148, 3, false])
    expect(f.lat).toBeCloseTo(6.02, 1)
    expect(stormFrame([tc('6', 10, 173)], here)).toEqual({ lat: 10, lon: 124, zoom: 5, alone: true })
  })
  it('too tall for zoom 3: 10N to 50N is 272 px against 146, so the place alone and flagged', () => {
    expect(stormFrame([tc('7', 50, 124)], here)).toEqual({ lat: 10, lon: 124, zoom: 5, alone: true })
  })
  it('across the antimeridian the short way: 179E and 179W are 2 degrees apart, zoom 7, centred on 180', () => {
    expect(stormFrame([tc('8', 10, -179)], { lat: 10, lon: 179 })).toEqual({ lat: 9.75, lon: -180, zoom: 7, alone: false })
  })
})
