import { describe, expect, it } from 'vitest'
import type { Entry } from '../safety/entries'
import { driveUrl, kindOf, kmLabel, spotsFor, splitSpots, type Kind } from './logic'

const e = (id: string, group: string, name: string, lat?: number, lon?: number): Entry => ({ id, group, name, phone: null, lat, lon, status: 'UNKNOWN', source: '', sourceUrl: null, date: '' })
const all = new Set<Kind>(['evac', 'health', 'police', 'fire'])
const me = { lat: 9.6457, lon: 123.878 }

describe('kindOf', () => {
  it('sorts by name then group, drops non-rescue entries', () => {
    expect(kindOf({ group: 'Fire and police', name: 'BFP Tagbilaran fire station' })).toBe('fire')
    expect(kindOf({ group: 'Fire, police and sea', name: 'PNP Tagbilaran' })).toBe('police')
    expect(kindOf({ group: 'Evacuation centres', name: 'Dao centre' })).toBe('evac')
    expect(kindOf({ group: 'Health and hospitals', name: 'Hospital' })).toBe('health')
    expect(kindOf({ group: 'Power and water', name: 'Water provider' })).toBeNull()
    expect(kindOf({ group: 'Emergency', name: 'Philippine Red Cross' })).toBeNull()
  })
})

describe('splitSpots', () => {
  const seed = [e('a', 'Evacuation centres', 'Far', 9.7, 123.9), e('b', 'Evacuation centres', 'Near', 9.646, 123.878), e('c', 'Health and hospitals', 'No pin'), e('d', 'Health and hospitals', 'Zero', 0, 0)]
  const spots = spotsFor('x', {}, seed)
  it('orders pins nearest first and lists entries without coordinates separately', () => {
    const r = splitSpots(spots, all, me)
    expect(r.pins.map((p) => p.id)).toEqual(['b', 'a', 'd'])
    expect(r.unpinned.map((p) => p.id)).toEqual(['c'])
  })
  it('filters by kind', () => {
    const r = splitSpots(spots, new Set<Kind>(['health']), me)
    expect(r.pins.map((p) => p.id)).toEqual(['d'])
    expect(r.unpinned).toHaveLength(1)
    expect(splitSpots(spots, new Set(), me)).toEqual({ pins: [], unpinned: [] })
  })
  it('distance is null, not 0, when our position is unknown', () => {
    expect(splitSpots(spots, all, null).pins.every((p) => p.km === null)).toBe(true)
  })
  it('family edits add a pin', () => {
    const s = spotsFor('x', { c: { lat: 9.65, lon: 123.88 } }, seed)
    expect(splitSpots(s, all, me).unpinned).toEqual([])
  })
  it('real distance is sane (about 1.1 km per 0.01 deg lat)', () => {
    const km = splitSpots(spotsFor('x', {}, [e('z', 'Evacuation centres', 'Z', 9.6557, 123.878)]), all, me).pins[0].km!
    expect(km).toBeGreaterThan(1.05)
    expect(km).toBeLessThan(1.15)
  })
})

describe('labels', () => {
  it('formats distance', () => {
    expect(kmLabel(null)).toBe('Distance unknown')
    expect(kmLabel(0.42)).toBe('420 m away')
    expect(kmLabel(3.14)).toBe('3.1 km away')
  })
  it('builds a driving link', () => expect(driveUrl(9.6, 123.8)).toBe('https://www.google.com/maps/dir/?api=1&destination=9.6,123.8&travelmode=driving'))
})
