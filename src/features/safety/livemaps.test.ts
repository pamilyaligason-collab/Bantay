import { describe, expect, it } from 'vitest'
import type { Alert } from './alerts'
import { cyclones, since, stormName, windySrc } from './LiveMaps'
import { STORM_ZOOM, stormCentre, zoomEarthUrl } from './stormView'

const a = (id: string, kind: Alert['kind'], issuedAt: string) => ({ id, kind, issuedAt, title: id, where: 'X, Philippines', level: 'Orange' }) as Alert

describe('windySrc', () => {
  it('sets overlay and rounds the position', () => {
    const u = windySrc('wind', 9.6512, 123.884, 8)
    expect(u).toContain('overlay=wind')
    expect(u).toContain('lat=9.65&lon=123.88&detailLat=9.65&detailLon=123.88')
    expect(u).toContain('zoom=8')
    expect(u.startsWith('https://embed.windy.com/embed.html?type=map')).toBe(true)
    for (const p of ['product=ecmwf', 'level=surface', 'marker=true']) expect(u).toContain(p)
  })
})
describe('cyclones', () => {
  it('keeps only GDACS tropical cyclones, newest first', () => {
    const out = cyclones([a('gdacs-VO-1', 'gdacs', '2026-10-17'), a('gdacs-TC-1', 'gdacs', '2026-10-15'), a('gdacs-TC-2', 'gdacs', '2026-10-16'), a('gdacs-TC-3', 'quake', '2026-10-18')])
    expect(out.map((x) => x.id)).toEqual(['gdacs-TC-2', 'gdacs-TC-1'])
  })
})
describe('storm list', () => {
  const tc = (over: Partial<Alert>) => ({ ...a('gdacs-TC-9', 'gdacs', '2026-10-12T00:00:00Z'), ...over }) as Alert
  it('hides stale rows', () => expect(cyclones([tc({ stale: true }), tc({ id: 'gdacs-TC-8' })]).map((x) => x.id)).toEqual(['gdacs-TC-8']))
  it('names the storm, falling back to the title when where is only a country or missing', () => {
    expect(stormName(tc({ where: 'Luzon, Philippines', title: 'Tropical Cyclone PEPITO' }))).toBe('Luzon')
    for (const where of ['Philippines', 'Philippines, Asia', 'Location not given', ''])
      expect(stormName(tc({ where, title: 'Tropical Cyclone PEPITO' }))).toBe('Tropical Cyclone PEPITO')
  })
  it('shows since date', () => {
    expect(since('2026-10-12T00:00:00Z')).toMatch(/12|11/)
    expect(since('nope')).toBe('date unknown')
  })
})

describe('storm map centre', () => {
  it('is the person\'s place, not 12N 128E', () => {
    expect(stormCentre({ lat: 6.2015, lon: 125.1878 })).toEqual({ lat: 6.2, lon: 125.19, zoom: STORM_ZOOM })
    expect(stormCentre({ lat: 29.7604, lon: -95.3698 })).toEqual({ lat: 29.76, lon: -95.37, zoom: STORM_ZOOM })
    const v = stormCentre({ lat: 9.65, lon: 123.88 })
    const u = windySrc('wind', v.lat, v.lon, v.zoom)
    expect(u).toContain('lat=9.65&lon=123.88')
    expect(u).not.toContain('lat=12.00')
  })
  it('the Zoom Earth link follows the same place', () => {
    expect(zoomEarthUrl({ lat: 9.65, lon: 123.88 })).toBe('https://zoom.earth/maps/satellite/#view=9.65,123.88,5z')
  })
})
