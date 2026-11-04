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
  const fresh = (q: Alert): Alert => ({ ...q, issuedAt: new Date(NOW - 600_000).toISOString() })
  it('far quake, hours old, no live position: the soft line', () => {
    expect(feltLine(quake(4.6, 272), here, 'Tagbilaran', NOW)).toBe('Probably too far to feel strongly. If you felt shaking, follow the steps below.')
  })
  it('far quake under an hour old keeps the protective wording', () => {
    expect(feltLine(fresh(quake(4.6, 272)), here, 'Tagbilaran', NOW)).toBe('About 272 km away. You may feel it. If you feel shaking, follow the steps below.')
  })
  it('never says no action needed for a big, near, unknown-size or fresh quake', () => {
    const unknown = a('q', 'quake', { title: 'Quake', level: null, lat: here.lat + 272 / 111.2, lon: here.lon })
    for (const t of [feltLine(quake(7, 900), here, 'X', NOW), feltLine(quake(5, 150), here, 'X', NOW), feltLine(unknown, here, 'X', NOW), feltLine(fresh(quake(4.6, 272)), here, 'X', NOW)]) expect(t).not.toMatch(/nothing to do|no action/i)
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
  const MIN = (n: number) => new Date(NOW - n * 60_000).toISOString()
  it('W1: no rows but the pull ran 4 min ago: "Checked 4 min ago", live', () => {
    for (const r of sourceRows([], NOW, false, MIN(4))) expect(r).toMatchObject({ sub: 'Checked 4 min ago', live: true })
  })
  it('W1: no rows and never checked: "Never checked", not live; "No rows yet" is gone', () => {
    expect(sourceRows([], NOW, false, null)[0]).toMatchObject({ sub: 'Never checked', live: false, never: true })
    expect(sourceRows([], NOW, false, MIN(180))[0]!.never).toBe(false) // checks stopped is not never
    expect(sourceRows([], NOW)[0]).toMatchObject({ sub: 'Never checked', live: false })
  })
  it('W1: rows 3 h old but the pull ran 5 min ago: live (the pull, not the row, is the check)', () => {
    const old = [a('u', 'quake', { source: 'USGS', checkedAt: MIN(180) })]
    expect(sourceRows(old, NOW, false, MIN(5)).find((x) => x.title === 'USGS')).toMatchObject({ sub: 'Checked 5 min ago', live: true })
  })
  it('W1: checks stopped (last pull 3 h ago, no rows): not live', () => {
    expect(sourceRows([], NOW, false, MIN(180))[0]).toMatchObject({ sub: 'Checked 3 h ago', live: false })
  })
  it('R1: stopped ingest (newest fetched_at 10 days old, phone pulled now): no source is live, none says "Checked 3 min ago"', () => {
    const tenDays = MIN(10 * 24 * 60)
    for (const r of sourceRows([a('u', 'quake', { source: 'USGS', checkedAt: tenDays })], NOW, false, tenDays)) expect(r).toMatchObject({ live: false, sub: 'Checked 10 days ago' })
  })
  it('R1: a source the ingest marked stale is not live even when another source was checked a minute ago', () => {
    const r = sourceRows([a('u', 'quake', { source: 'USGS', checkedAt: MIN(300), stale: true })], NOW, false, MIN(1))
    expect(r.find((x) => x.title === 'USGS')).toMatchObject({ live: false, sub: 'Checked 5 h ago' })
    expect(r.find((x) => x.title === 'PAGASA')).toMatchObject({ live: true })
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
