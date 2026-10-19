import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { awayText, mapView, pickStorm } from './stormView'

const tc = (id: string, lat: number | null, lon: number | null, extra: Partial<Alert> = {}) =>
  ({ id: `gdacs-TC-${id}`, kind: 'gdacs', issuedAt: '2026-10-12T00:00:00Z', title: 'TC', where: '', level: 'Orange', lat, lon, ...extra }) as Alert
const here = { lat: 6.1, lon: 125.2 }

describe('pickStorm', () => {
  it('hides when there is no storm', () => expect(pickStorm([], here)).toBeNull())
  it('ignores non-cyclone, stale and unplaced rows', () => {
    expect(pickStorm([{ ...tc('1', 10, 130), kind: 'quake' } as Alert, tc('2', 10, 130, { stale: true }), tc('3', null, null)], here)).toBeNull()
  })
  it('picks the nearest storm', () => expect(pickStorm([tc('far', 20, 140), tc('near', 10, 128)], here)?.id).toBe('gdacs-TC-near'))
  it('takes the newest when the place is unknown', () => expect(pickStorm([tc('a', 10, 128), tc('b', 11, 129, { issuedAt: '2026-10-14T00:00:00Z' })], null)?.id).toBe('gdacs-TC-b'))
})

describe('awayText / mapView', () => {
  it('gives a direction and rounded distance', () => expect(awayText(here, { lat: 6.1, lon: 129 })).toMatch(/^about \d+0 km east of you$/))
  it('is null without a place', () => expect(awayText(null, { lat: 1, lon: 1 })).toBeNull())
  it('centres between both points and zooms out for far storms', () => {
    const v = mapView({ lat: 12, lon: 130 }, here)
    expect(v.lat).toBeCloseTo(9.05); expect(v.zoom).toBeLessThanOrEqual(5)
  })
  it('centres on the storm with no place', () => expect(mapView({ lat: 12, lon: 130 }, null)).toMatchObject({ lat: 12, lon: 130 }))
})
