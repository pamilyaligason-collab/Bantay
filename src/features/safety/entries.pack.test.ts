import { describe, expect, it } from 'vitest'
import { kindOf } from '../rescuemap/logic'
import { dialable, entriesFromPack, type PackPlace, packGroup, packStale } from './entries'

describe('region pack rows', () => {
  const NOW = Date.parse('2026-11-04T00:00:00Z')
  const row = (o: Partial<PackPlace>): PackPlace => ({ id: 'r', psgc: '1', kind: 'evac', name: 'Invented Hall', address: 'Main St', phones: [], lat: 9.1, lon: 123.1, capacity: null, status: 'confirmed', source: 'Invented source', url: 'https://example.test/', licence: 'x', dated: null, verified: '2026-10-01', confidence: 'high', ...o })
  it('maps every kind to the group the Safety lists use', () => {
    const g = Object.fromEntries(['evac', 'hospital', 'rhu', 'bhs', 'clinic', 'police', 'fire', 'drrmo', 'coastguard', 'redcross', 'hotline', 'other'].map((k) => [k, packGroup(k)]))
    expect(g).toEqual({ evac: 'Evacuation centres', hospital: 'Health and hospitals', rhu: 'Health and hospitals', bhs: 'Health and hospitals', clinic: 'Health and hospitals', police: 'Police', fire: 'Fire', drrmo: 'Rescue', coastguard: 'Rescue', redcross: 'Rescue', hotline: 'Rescue', other: 'Rescue' })
  })
  it('status: confirmed is CONFIRMED, not_confirmed is UNVERIFIED', () => {
    const [a, b] = entriesFromPack([row({}), row({ id: 'q', status: 'not_confirmed' })], NOW)
    expect([a!.status, b!.status]).toEqual(['CONFIRMED', 'UNVERIFIED'])
  })
  it('dialable follows the pack script: +63 or 0 with 9-10 digits, or a 3-5 digit code', () => {
    for (const ok of ['0917 123 4567', '+63 917 123 4567', '(083) 552-3221', '911', '8888', '1553']) expect(dialable(ok), ok).toBe(true)
    for (const no of ['552-3939', '552-8861 (TO 62)', '411 4868 / 4869', '12']) expect(dialable(no), no).toBe(false)
  })
  it('the first number is a call button only when dialable; otherwise it is text to copy', () => {
    const [a, b, c] = entriesFromPack([row({ phones: ['(083) 552-3221'] }), row({ phones: ['552-3939'] }), row({ phones: [] })], NOW)
    expect([a!.phone, a!.copy]).toEqual(['(083) 552-3221', undefined])
    expect([b!.phone, b!.copy]).toEqual([null, '552-3939'])
    expect([c!.phone, c!.copy]).toEqual([null, undefined])
  })
  it('May be out of date: checked over 365 days ago, or the source dated over 2 years ago', () => {
    expect(packStale('2026-10-01', null, NOW)).toBe(false)
    expect(packStale('2025-11-05', null, NOW)).toBe(false) // 364 days
    expect(packStale('2025-11-03', null, NOW)).toBe(true) // 366 days
    expect(packStale('2026-10-01', '2024-11-05', NOW)).toBe(false)
    expect(packStale('2026-10-01', '2015-12-15', NOW)).toBe(true) // an old fire table
  })
  it('carries the checked date, the source date and the pack kind', () => {
    const [e] = entriesFromPack([row({ kind: 'fire', dated: '2015-12-15' })], NOW)
    expect(e).toMatchObject({ date: '2026-10-01', sourceDated: '2015-12-15', stale: true, packKind: 'fire', group: 'Fire' })
  })
  it('kindOf trusts the pack kind before the name', () => {
    expect(kindOf({ group: 'Rescue', name: 'Fire and Police Plaza', packKind: 'evac' })).toBe('evac')
    expect(kindOf({ group: 'Health and hospitals', name: 'Hall', packKind: 'rhu' })).toBe('health')
    expect(kindOf({ group: 'Rescue', name: 'CDRRMO', packKind: 'drrmo' })).toBeNull()
    expect(kindOf({ group: 'Police', name: 'Station' })).toBeNull() // old rule unchanged
  })
})
