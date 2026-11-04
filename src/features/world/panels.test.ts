import { describe, expect, it } from 'vitest'
import { digestHeadline, digestShown, manilaDay, PANELS, parseDigest, readPanels } from './panels'

describe('panels', () => {
  it('has the three agreed panels', () => expect([...PANELS]).toEqual(['forecasts', 'macro', 'volcanoes']))
  it('all on by default; junk and unknown keys are ignored', () => {
    const on = { forecasts: true, macro: true, volcanoes: true }
    expect(readPanels(undefined)).toEqual(on)
    expect(readPanels('x')).toEqual(on)
    expect(readPanels({ macro: 'no', extra: false })).toEqual(on)
    expect(readPanels({ macro: false })).toEqual({ ...on, macro: false })
  })
})

describe('parseDigest', () => {
  const body = { day: '2026-11-05', counts: { tcws: 1, quake: 2, eonet: 0 }, top: [{ id: 'a', title: 'T', kind: 'quake', level: 'M6', source: 'USGS' }, { id: 5, title: 'bad' }], sources: 'USGS' }
  it('sums counts and keeps only well-formed top rows', () => {
    expect(parseDigest({ day: '2026-11-05', body })).toEqual({ day: '2026-11-05', total: 3, top: [{ id: 'a', title: 'T', kind: 'quake', level: 'M6', source: 'USGS' }], sources: 'USGS', summary: '' })
  })
  it('falls back to body.day and rejects rows without a date or body', () => {
    expect(parseDigest({ body })?.day).toBe('2026-11-05')
    expect(parseDigest({ day: 'yesterday', body })).toBeNull()
    expect(parseDigest({ day: '2026-11-05' })).toBeNull()
    expect(parseDigest(null)).toBeNull()
  })
  it('ignores negative and non-number counts; keeps at most five rows', () => {
    const top = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, title: `t${i}` }))
    const d = parseDigest({ day: '2026-11-05', body: { counts: { a: -2, b: 'x', c: 1.9 }, top } })!
    expect(d.total).toBe(1)
    expect(d.top.length).toBe(5)
  })
  it('the server line wins: an unchecked feed with zero counts never reads as a quiet day', () => {
    const unchecked = parseDigest({ day: '2026-11-05', body: { counts: {}, top: [], summary: 'Some warning feeds were not checked recently, so this may be missing some.' } })!
    expect(digestHeadline(unchecked)).toBe('Some warning feeds were not checked recently, so this may be missing some.')
    expect(digestHeadline(parseDigest({ day: '2026-11-05', body: { counts: {}, top: [], summary: 'No warnings in the last 24 h' } })!)).toBe('No warnings in the last 24 h')
  })
  it('without a server line it counts warnings only (EONET is awareness) and never claims a quiet day', () => {
    const d = parseDigest({ day: '2026-11-05', body: { counts: { eonet: 3, quake: 1 }, top: [] } })!
    expect(d.total).toBe(1)
    expect(digestHeadline(d)).toBe('1 warning in the last 24 h')
    expect(digestHeadline(parseDigest({ day: '2026-11-05', body: { counts: { eonet: 3 }, top: [] } })!)).toBe('Nothing to report in this digest.')
  })
})

describe('digestShown (Manila clock)', () => {
  const d = { day: '2026-11-05', total: 1, top: [], sources: '', summary: '' }
  const t = (iso: string) => Date.parse(iso)
  it('manilaDay rolls over at 16:00 UTC', () => {
    expect(manilaDay(t('2026-11-05T15:59:00Z'))).toBe('2026-11-05')
    expect(manilaDay(t('2026-11-05T16:00:00Z'))).toBe('2026-11-06')
  })
  it('not before the chosen time, yes from it', () => {
    expect(digestShown(d, '07:00', t('2026-11-04T22:59:00Z'))).toBe(false) // 06:59
    expect(digestShown(d, '07:00', t('2026-11-04T23:00:00Z'))).toBe(true) // 07:00 exactly
    expect(digestShown(d, '07:00', t('2026-11-05T15:30:00Z'))).toBe(true) // 23:30 on the 5th: still that day
  })
  it('not on another Manila day, and never for null or a bad time', () => {
    expect(digestShown(d, '07:00', t('2026-11-05T16:30:00Z'))).toBe(false) // 00:30 on the 6th
    expect(digestShown(null, '07:00', t('2026-11-05T01:00:00Z'))).toBe(false)
    expect(digestShown(d, 'soon', t('2026-11-05T01:00:00Z'))).toBe(false)
  })
})
