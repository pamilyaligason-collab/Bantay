import { describe, expect, it } from 'vitest'
import type { Alert } from './alerts'
import { agoText, feltLine, sourceRows } from './warningsLogic'

const NOW = Date.parse('2026-11-01T12:00:00Z')
const here = { lat: 9.65, lon: 123.88 }
const a = (id: string, kind: Alert['kind'], over: Partial<Alert> = {}): Alert => ({
  id, kind, level: null, title: id, what: '', where: '', when: '', doNow: '', source: '', sourceUrl: null,
  issuedAt: '2026-11-01T01:00:00Z', lat: null, lon: null, bulletin: '', ...over
})
// 1 degree of latitude is about 111 km
const quake = (mag: number, km: number) => a('q', 'quake', { title: `M ${mag}`, level: `M${mag}`, lat: here.lat + km / 111.2, lon: here.lon })

describe('feltLine', () => {
  it('far quake: too far to feel', () => {
    expect(feltLine(quake(4.6, 272), here, 'Tagbilaran')).toBe('About 272 km away. You may feel it. If you feel shaking, follow the steps below.') // the affectsUs (D-88) wording Today uses
  })
  it('never says nothing to do or no action needed', () => {
    for (const t of [feltLine(quake(4.6, 272), here, 'X'), feltLine(quake(7, 900), here, 'X'), feltLine(quake(5, 150), here, 'X')]) expect(t).not.toMatch(/nothing to do|no action/i)
  })
  it('M7 at 900 km is beyond the radius and still carries the tsunami line', () => {
    const t = feltLine(quake(7, 900), here, 'Tagbilaran')
    expect(t).toContain('About 900 km away. You may feel it.')
    expect(t).toContain('watch for a tsunami warning')
  })
  it('unknown magnitude: 100 km radius, no tsunami line', () => {
    const q = a('q', 'quake', { title: 'Quake', level: null, lat: here.lat + 300 / 111.2, lon: here.lon })
    const t = feltLine(q, here, 'Tagbilaran')
    expect(t).toContain('About 300 km away.')
    expect(t).not.toContain('tsunami')
  })
  it('inside the felt radius: may have felt it', () => {
    expect(feltLine(quake(5.0, 150), here, 'Tagbilaran')).toBe('You may have felt this in Tagbilaran. If you did, follow the steps below.')
  })
  it('M6.5 adds the tsunami tail', () => {
    const t = feltLine(quake(6.5, 300), here, 'Tagbilaran')
    expect(t).toContain('You may have felt this in Tagbilaran.')
    expect(t).toContain('watch for a tsunami warning')
  })
  it('non-quake uses the affects line', () => {
    expect(feltLine(a('t', 'tcws', { lat: 9.7, lon: 123.9 }), here, 'Tagbilaran')).toContain('Near you')
  })
  it('quake with no point falls back to the affects line', () => {
    expect(feltLine(a('q', 'quake'), here, 'Tagbilaran')).toContain('Covers your area')
  })
})

describe('sourceRows', () => {
  const rows = [
    a('p', 'tcws', { source: 'PAGASA public alert feed', checkedAt: '2026-11-01T11:50:00Z' }),
    a('u', 'quake', { source: 'USGS', checkedAt: '2026-11-01T08:00:00Z' }),
    a('g', 'gdacs', { source: 'GDACS', checkedAt: '2026-11-01T11:55:00Z' })
  ]
  it('one row per source with freshness text and live flag', () => {
    const r = sourceRows(rows, NOW)
    expect(r.map((x) => x.title)).toEqual(['PAGASA', 'USGS', 'GDACS'])
    expect(r[0]).toMatchObject({ sub: 'Checked 10 min ago', live: true })
    expect(r[1]).toMatchObject({ sub: 'Checked 4 h ago', live: false })
    expect(r[2]!.live).toBe(true)
  })
  it('a source with no rows says so', () => {
    expect(sourceRows([], NOW)[0]).toMatchObject({ sub: 'No rows yet', live: false })
  })
  it('PHIVOLCS row only when asked', () => {
    expect(sourceRows(rows, NOW, true).map((x) => x.title)).toContain('PHIVOLCS')
    expect(sourceRows(rows, NOW).map((x) => x.title)).not.toContain('PHIVOLCS')
  })
})

describe('agoText', () => {
  it('reads minutes, hours, days', () => {
    expect(agoText('2026-11-01T11:30:00Z', NOW)).toBe('30 min ago')
    expect(agoText('2026-11-01T01:00:00Z', NOW)).toBe('11 h ago')
    expect(agoText('2026-10-29T12:00:00Z', NOW)).toBe('3 days ago')
    expect(agoText('nope', NOW)).toBe('time unknown')
  })
})
