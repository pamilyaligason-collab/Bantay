import { describe, expect, it } from 'vitest'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { type Entry, firstNumber, forZone, googleGo, hasPoint, parseEdit, telHref, withOverrides } from './entries'

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
    for (const e of hotlines as Entry[]) if (!e.phone && !e.link) expect(e.status, e.id).toBe('UNKNOWN')
  })
  it('keeps 911, and leaves out 160', () => {
    expect((hotlines as Entry[]).find((h) => h.phone === '911' && h.zone === 'ph')?.status).toBe('CONFIRMED')
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

const SETS = ['gensan', 'tagbilaran', 'davao', 'cebu', 'manila', 'texas', 'ph', 'ofw', 'tele']
describe('hotline sets (PART-3 4.1)', () => {
  const rows = hotlines as Entry[]
  it('every row is in one of the nine sets and has a valid status', () => {
    for (const e of rows) {
      expect(SETS, e.id).toContain(e.zone)
      expect(['CONFIRMED', 'LISTED', 'UNVERIFIED', 'UNKNOWN'], e.id).toContain(e.status)
    }
  })
  it('every set has rows, ids are unique, and a row without a source link is not CONFIRMED', () => {
    for (const z of SETS) expect(rows.filter((e) => e.zone === z).length, z).toBeGreaterThan(0)
    expect(new Set(rows.map((e) => e.id)).size).toBe(rows.length)
    for (const e of rows) if (e.status === 'CONFIRMED') expect(e.sourceUrl, e.id).toBeTruthy()
  })
  it('link rows (apps) have no number but a source link', () => {
    const links = rows.filter((e) => e.link)
    expect(links.length).toBeGreaterThan(0)
    for (const e of links) { expect(e.phone, e.id).toBeNull(); expect(e.sourceUrl, e.id).toMatch(/^https:/) }
  })
  it('the old Dampas and Conel home zones read the Tagbilaran and General Santos sets', () => {
    expect(forZone(rows, 'dampas').some((e) => e.zone === 'tagbilaran')).toBe(true)
    expect(forZone(rows, 'conel').some((e) => e.zone === 'gensan')).toBe(true)
    expect(forZone(rows, 'conel').some((e) => e.zone === 'tagbilaran')).toBe(false)
  })
})

describe('telHref', () => {
  it('dials the first number of a list or a note', () => {
    expect(telHref('(038) 411 4868')).toBe('tel:0384114868')
    expect(telHref('1553 / 1800-1888-1553')).toBe('tel:1553')
    expect(telHref('1348 (abroad: +63 2 1348)')).toBe('tel:1348')
    expect(telHref('(02) 8426-1468 to 79')).toBe('tel:028426' + '1468')
    expect(telHref('+1 (346) 256-4522')).toBe('tel:+13462564522')
    expect(telHref('0919 160 1752 (Smart) / 0917 847 5757 (Globe)')).toBe('tel:09191601752')
    expect(firstNumber('79880 (mobile) / (02) 7798-8000')).toBe('79880')
  })
})
