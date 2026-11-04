// @vitest-environment node
// PARSER ONLY (not wired into SOURCES). Fixtures are real PHIVOLCS pages read once on 2026-11-04 (no bot check): the first 8 rows of the latest-earthquakes table, and one
// English volcano bulletin with scripts removed. Every magnitude in the quake sample is small, so the relevance cases change a magnitude in the saved text; expected values are hand-calculated.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SOURCES, tier1 } from './ingest.ts'
import { parsePhivolcsQuakes, parsePhivolcsTime, parseVolcanoBulletin } from './phivolcs.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const quakes = fx('phivolcs-quakes.html')
const volcano = fx('phivolcs-volcano.html')
const NOW = Date.parse('2026-11-04T16:00:00Z') // 2026-11-05 00:00 PH time
const SOON = Date.parse('2026-11-03T17:00:00Z') // an hour after the volcano bulletin's date: the new-tier rows push only while young
const withMag = (mag: string) => quakes.replace('>2.3<', `>${mag}<`) // the newest row: 5.55 N, 125.38 E, depth 29 km, about 75 km from Conel

describe('parsePhivolcsTime', () => {
  it('reads Philippine time (UTC+8) with 12-hour clock edges', () => {
    expect(new Date(parsePhivolcsTime('04 November 2026 - 11:34 PM')!).toISOString()).toBe('2026-11-04T15:34:00.000Z')
    expect(new Date(parsePhivolcsTime('04 November 2026 - 12:05 AM')!).toISOString()).toBe('2026-11-03T16:05:00.000Z')
    expect(new Date(parsePhivolcsTime('04 November 2026 - 12:05 PM')!).toISOString()).toBe('2026-11-04T04:05:00.000Z')
  })
  it('anything else is null', () => {
    for (const s of ['', 'junk', '4 Nov 2026', '04 Smarch 2026 - 11:34 PM', '04 November 2026 - 13:34 PM']) expect(parsePhivolcsTime(s), s).toBeNull()
  })
})

describe('parsePhivolcsQuakes', () => {
  it('the saved page: 8 table rows, all too small and too far to list (M1.4 to M2.3), none invented', () => {
    expect(parsePhivolcsQuakes(quakes, NOW)).toEqual([])
  })
  it('a quake that passes the USGS rules is mapped field by field', () => {
    const rows = parsePhivolcsQuakes(withMag('5.2'), NOW)!
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'phivolcs-quake-2026_1104_153439_B1F', kind: 'quake', level: 'Magnitude 5.2', source: 'PHIVOLCS', lat: 5.55, lon: 125.38,
      issued_at: '2026-11-04T15:34:00.000Z', when_text: '2026-11-04 23:34 PH time', expires_at: '2026-11-05T15:34:00.000Z', checklist: null, timeline: null
    })
    expect(rows[0].what).toMatch(/^Magnitude 5\.2 earthquake, about 7[56] km from Conel, General Santos City\.$/)
    expect(rows[0].where_text).toBe('013 km N 49° W of Sarangani Island (Municipality Of Sarangani) (Davao Occidental)')
    expect(rows[0].bulletin).toContain('Depth: 29 km.')
  })
  it('shares the USGS size and distance rules: M3.4 is dropped at 75 km, M3.5 is kept', () => {
    expect(parsePhivolcsQuakes(withMag('3.4'), NOW)).toEqual([])
    expect(parsePhivolcsQuakes(withMag('3.5'), NOW)).toHaveLength(1)
  })
  it('a quake older than 24 hours is dropped', () => expect(parsePhivolcsQuakes(withMag('5.2'), Date.parse('2026-11-05T15:35:00Z'))).toEqual([]))
  it('an M6 row is a tier-1 case for the ingest (the parser output feeds tier1 unchanged)', () => {
    const rows = parsePhivolcsQuakes(withMag('6.1'), NOW)!
    expect(tier1(rows, NOW)).toEqual([{ ref: 'phivolcs-quake-2026_1104_153439_B1F:m6', template: 'quake_strong' }])
  })
  it('a page that is not the table, or a table row with an unreadable value, fails instead of reading as "no quakes"', () => {
    for (const bad of [null, undefined, '', '<html>blocked</html>', '<html>PHIVOLCS LATEST EARTHQUAKE INFORMATION</html>']) expect(parsePhivolcsQuakes(bad, NOW), String(bad)).toBeNull()
    expect(parsePhivolcsQuakes(quakes.replace('>125.38<', '>n/a<'), NOW)).toBeNull()
    expect(parsePhivolcsQuakes(quakes.replace('04 November 2026 - 11:34 PM', 'yesterday'), NOW)).toBeNull()
  })
})

describe('parseVolcanoBulletin', () => {
  it('reads the volcano, the alert level and the bulletin date', () => {
    const r = parseVolcanoBulletin(volcano, NOW)!
    expect(r).toMatchObject({
      id: 'phivolcs-volcano-mayon', kind: 'volcano', level: 'Alert Level 3', title: 'Mayon Volcano: Alert Level 3', source: 'PHIVOLCS',
      issued_at: '2026-11-03T16:00:00.000Z', lat: null, lon: null, expires_at: '2026-11-07T16:00:00.000Z'
    })
    expect(r.do_now).toContain('Follow PHIVOLCS bulletins')
  })
  it('level 3 or higher is a tier-1 case; level 2 is not; the ref carries the level so a raise notifies again', () => {
    const at = (n: number) => parseVolcanoBulletin(volcano.replace(/ALERT LEVEL(\s|<[^>]*>)*3/g, (m) => m.replace('3', String(n))), NOW)!
    expect(tier1([at(3)], SOON)).toEqual([{ ref: 'phivolcs-volcano-mayon:l3', template: 'volcano_raised' }])
    expect(tier1([at(4)], SOON)).toEqual([{ ref: 'phivolcs-volcano-mayon:l4', template: 'volcano_raised' }])
    expect(at(2).level).toBe('Alert Level 2')
    expect(tier1([at(2)], SOON)).toEqual([])
  })
  it('alert level 0 is written already expired', () => {
    const r = parseVolcanoBulletin(volcano.replace(/ALERT LEVEL(\s|<[^>]*>)*3/g, (m) => m.replace('3', '0')), NOW)!
    expect(r.level).toBe('Alert Level 0')
    expect(r.expires_at).toBe(new Date(NOW).toISOString())
  })
  it('a page without a readable name, level or date is null, never a guessed level', () => {
    for (const bad of [null, '', '<html>blocked</html>', volcano.replace(/MAYON VOLCANO/g, 'MAYON'), volcano.replace(/ALERT LEVEL/g, 'LEVEL'), volcano.replace(/Date:/g, 'Day:')]) expect(parseVolcanoBulletin(bad, NOW), String(bad).slice(0, 30)).toBeNull()
  })
})

describe('not wired', () => {
  it('PHIVOLCS is not a source of the ingest', () => {
    expect(SOURCES.map((s) => s.source)).not.toContain('PHIVOLCS')
    expect(SOURCES.flatMap((s) => s.urls).join(' ')).not.toMatch(/phivolcs/i)
  })
})
