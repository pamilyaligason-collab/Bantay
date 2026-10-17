import { describe, expect, it } from 'vitest'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { type Entry, googleGo, hasPoint, parseEdit, withOverrides } from './entries'

const seeds = [...places, ...hotlines] as Entry[]

describe('seed data (B-5)', () => {
  it('every entry has a source and date', () => {
    for (const e of seeds) {
      expect(e.source.length, e.id).toBeGreaterThan(0)
      expect(e.date, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
  it('a missing value is null and the entry is UNKNOWN', () => {
    for (const e of places as Entry[]) if (!hasPoint(e)) expect(e.status, e.id).toBe('UNKNOWN')
    for (const e of hotlines as Entry[]) if (!e.phone) expect(e.status, e.id).toBe('UNKNOWN')
  })
  it('keeps 911, and leaves out 160', () => {
    expect((hotlines as Entry[]).find((h) => h.phone === '911')?.status).toBe('CONFIRMED')
    expect(JSON.stringify(hotlines)).not.toMatch(/"160"/)
  })
})

describe('go link', () => {
  it('is the walking directions url', () => {
    expect(googleGo(9.6, 123.8)).toBe('https://www.google.com/maps/dir/?api=1&destination=9.6,123.8&travelmode=walking')
  })
})

describe('parseEdit', () => {
  it('accepts valid coordinates and stamps the family as source', () => {
    const r = parseEdit({ lat: '9.65', lon: '123.88' }, true, '2026-10-17')
    expect(r).toEqual({ ok: true, patch: { lat: 9.65, lon: 123.88, status: 'FAMILY', source: 'Added by the family', sourceUrl: null, date: '2026-10-17' } })
  })
  it('rejects blanks, text and out-of-range values', () => {
    for (const f of [{}, { lat: '', lon: '1' }, { lat: 'x', lon: '1' }, { lat: '91', lon: '1' }, { lat: '1', lon: '181' }]) expect(parseEdit(f, true).ok).toBe(false)
  })
  it('validates phone numbers', () => {
    expect(parseEdit({ phone: '(038) 501 9175' }, false).ok).toBe(true)
    expect(parseEdit({ phone: 'call me' }, false).ok).toBe(false)
  })
})

it('withOverrides merges by id and leaves others alone', () => {
  const out = withOverrides(places as Entry[], { 'evac-dao': { lat: 1, lon: 2, status: 'FAMILY' } })
  expect(out.find((e) => e.id === 'evac-dao')?.lat).toBe(1)
  expect(out.find((e) => e.id === 'evac-dampas')?.lat).toBeNull()
})
