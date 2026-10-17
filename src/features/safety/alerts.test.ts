import { describe, expect, it } from 'vitest'
import { type Alert, diffBulletin, distanceKm, hazardOf, HOME, rankAlerts, tierOf } from './alerts'

const a = (id: string, kind: Alert['kind'], over: Partial<Alert> = {}): Alert => ({
  id, kind, level: null, title: id, what: '', where: '', when: '', doNow: '', source: '', sourceUrl: null,
  issuedAt: '2026-10-17T00:00:00Z', lat: null, lon: null, bulletin: '', ...over
})

describe('rankAlerts', () => {
  it('orders by priority tier', () => {
    const out = rankAlerts([a('g', 'gdacs'), a('l', 'local'), a('u', 'utility'), a('q', 'quake'), a('h', 'heat'), a('t', 'tcws')], null)
    expect(out.map((x) => x.id)).toEqual(['h', 't', 'q', 'u', 'l', 'g'])
  })
  it('volcano ranks with PHIVOLCS (tier 1), air quality below it with utilities (tier 2, never above an official warning)', () => {
    const out = rankAlerts([a('air', 'air'), a('v', 'volcano'), a('u', 'utility', { issuedAt: '2026-10-16T00:00:00Z' }), a('q', 'quake', { lat: 9.7, lon: 123.9 }), a('t', 'tcws')], null)
    expect(out.map((x) => x.id)).toEqual(['t', 'v', 'q', 'air', 'u'])
    expect(tierOf('volcano')).toBe(tierOf('quake'))
    expect(tierOf('air')).toBeGreaterThan(tierOf('tcws'))
  })
  it('volcano and air have no practice card', () => {
    expect(hazardOf('volcano')).toBeNull()
    expect(hazardOf('air')).toBeNull()
    expect(hazardOf('quake')).toBe('earthquake')
  })
  it('within a tier, nearest to the given location first', () => {
    const near = a('near', 'quake', { lat: 9.7, lon: 123.9 })
    const far = a('far', 'quake', { lat: 7.0, lon: 125.0 })
    expect(rankAlerts([far, near], null).map((x) => x.id)).toEqual(['near', 'far'])
    // from Davao-ish, the far one is nearer
    expect(rankAlerts([near, far], { lat: 7.05, lon: 125.05 }).map((x) => x.id)).toEqual(['far', 'near'])
  })
  it('ties go to the newest, and input is not mutated', () => {
    const old = a('old', 'heat', { issuedAt: '2026-10-16T00:00:00Z' })
    const nu = a('new', 'heat')
    const input = [old, nu]
    expect(rankAlerts(input, null).map((x) => x.id)).toEqual(['new', 'old'])
    expect(input[0].id).toBe('old')
  })
})

describe('diffBulletin', () => {
  it('returns null with no previous version', () => {
    expect(diffBulletin(null, 'Signal No. 2.')).toBeNull()
  })
  it('lists added and removed sentences', () => {
    const d = diffBulletin('Signal No. 1. Winds 40 kph.', 'Signal No. 2. Winds 40 kph.')
    expect(d).toEqual({ added: ['Signal No. 2.'], removed: ['Signal No. 1.'] })
  })
})

it('distanceKm is zero at the same point and about 111 km per degree of latitude', () => {
  expect(distanceKm(HOME, HOME)).toBe(0)
  expect(distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.2, 0)
})
