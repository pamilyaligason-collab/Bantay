// @vitest-environment node
// fixtures/eonet.json is a real EONET v3 response (open events, last 3 days, fetched read-only 2026-11-04): two storm events, one near the Philippine box and one far away.
// Expected values are hand-calculated from that file. Polygon and the other categories are not in the sample; those cases use small invented events.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EONET_BOX, parseEonet } from './eonet.ts'
import { tier1 } from './ingest.ts'

const real = JSON.parse(readFileSync(new URL('./fixtures/eonet.json', import.meta.url), 'utf8'))
const NOW = Date.parse('2026-11-04T12:00:00Z')
const H = 3_600_000
const ev = (o: Record<string, unknown> = {}) => ({
  id: 'EONET_1', title: 'Test Fire', closed: null, link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1', categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [{ id: 'X', url: 'https://example.org' }],
  geometry: [{ date: '2026-11-04T06:00:00Z', type: 'Point', coordinates: [124, 10] }], ...o
})
const run = (events: unknown[], now = NOW) => parseEonet({ events }, now)!

describe('parseEonet on the real response', () => {
  const rows = parseEonet(real, NOW)!
  it('keeps the storm in the western Pacific box and drops the one over the Bay of Bengal side', () => {
    expect(rows.map((r) => r.id)).toEqual(['eonet-EONET_25728']) // Murasu is at 80.2 E, outside lon 100..155
  })
  it('maps the newest point of the event', () => {
    expect(rows[0]).toMatchObject({
      kind: 'eonet', level: '80 kts', title: 'Super Typhoon In-fa', source: 'EONET', source_url: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_25728',
      issued_at: '2026-11-04T06:00:00.000Z', when_text: '2026-11-04 14:00 PH time', lat: 25, lon: 138.3, expires_at: '2026-11-07T06:00:00.000Z', checklist: null, timeline: null
    })
    expect(rows[0].bulletin).toContain('Reported by: JTWC.')
  })
  it('is said to be awareness only, calm, with nothing to do', () => {
    expect(rows[0].what).toContain('This is not an official warning.')
    expect(rows[0].do_now).toContain('Nothing to do now.')
    expect(rows[0].do_now).toContain('Follow PAGASA and PHIVOLCS')
  })
  it('expires 72 hours after the newest point: at that instant it is gone', () => {
    expect(parseEonet(real, Date.parse('2026-11-07T05:59:00Z'))).toHaveLength(1)
    expect(parseEonet(real, Date.parse('2026-11-07T06:00:00Z'))).toEqual([])
  })
  it('never notifies: not one tier-1 case', () => expect(tier1(rows, NOW)).toEqual([]))
})

describe('parseEonet rules', () => {
  it('the box edges', () => {
    const at = (lat: number, lon: number) => run([ev({ geometry: [{ date: '2026-11-04T06:00:00Z', type: 'Point', coordinates: [lon, lat] }] })]).length
    expect(at(EONET_BOX.minLat, EONET_BOX.minLon)).toBe(1)
    expect(at(EONET_BOX.maxLat, EONET_BOX.maxLon)).toBe(1)
    expect(at(EONET_BOX.maxLat + 0.1, 124)).toBe(0)
    expect(at(10, EONET_BOX.minLon - 0.1)).toBe(0)
  })
  it('uses the newest dated point, in any array order, and ignores an unreadable one', () => {
    const rows = run([ev({ geometry: [
      { date: '2026-11-04T06:00:00Z', type: 'Point', coordinates: [124, 10], magnitudeValue: 5, magnitudeUnit: 'kts' },
      { date: '2026-11-03T06:00:00Z', type: 'Point', coordinates: [130, 12] },
      { date: 'junk', type: 'Point', coordinates: [1, 1] },
      { date: '2026-11-04T07:00:00Z', type: 'Point', coordinates: ['x', 'y'] }
    ] })])
    expect(rows[0]).toMatchObject({ lat: 10, lon: 124, level: '5 kts' })
  })
  it('a point dated in the future is never the latest point', () => {
    expect(run([ev({ geometry: [{ date: '2026-11-04T18:00:00Z', type: 'Point', coordinates: [124, 10] }] })])).toEqual([])
    expect(run([ev({ geometry: [{ date: '2026-11-04T12:30:00Z', type: 'Point', coordinates: [124, 10] }] })])).toHaveLength(1) // within the hour of clock skew
  })
  it('drops a closed event, an event with no geometry, and the categories with no action', () => {
    expect(run([ev({ closed: '2026-11-04T00:00:00Z' }), ev({ id: 'b', geometry: [] }), ev({ id: 'c', categories: [{ id: 'seaLakeIce', title: 'Sea and Lake Ice' }] }), ev({ id: 'd', categories: [{ id: 'snow', title: 'Snow' }] })])).toEqual([])
  })
  it('a Polygon is read as the mean of its ring', () => {
    const r = run([ev({ geometry: [{ date: '2026-11-04T06:00:00Z', type: 'Polygon', coordinates: [[[120, 10], [122, 10], [122, 12], [120, 12]]] }] })])
    expect(r[0]).toMatchObject({ lat: 11, lon: 121 })
  })
  it('unknown magnitude stays null; the title is clipped; the row id is the event id', () => {
    const r = run([ev({ title: 'x'.repeat(300) })])
    expect(r[0].level).toBeNull()
    expect(r[0].title).toHaveLength(160)
    expect(r[0].id).toBe('eonet-EONET_1')
    expect(r[0].bulletin).toContain('Latest reading: not given.')
  })
  it('checks the text fields that reach the app: id shape, unit, source ids (max 5), link host and length', () => {
    expect(run([ev({ id: 'x; drop table' }), ev({ id: 'EONET_' }), ev({ id: 'EONET_1234567890123' })])).toEqual([])
    const g = (u: unknown) => [{ date: '2026-11-04T06:00:00Z', type: 'Point', coordinates: [124, 10], magnitudeValue: 5, magnitudeUnit: u }]
    expect(run([ev({ geometry: g('<b>kts</b>') })])[0].level).toBe('5') // not a plain short unit: dropped, the number stays
    expect(run([ev({ geometry: g('kts') })])[0].level).toBe('5 kts')
    const srcs = Array.from({ length: 8 }, (_, i) => ({ id: `S${i}` })).concat([{ id: '<script>' }])
    expect(run([ev({ sources: srcs })])[0].bulletin).toContain('Reported by: S0, S1, S2, S3, S4.')
    expect(run([ev({ link: 'https://evil.example/x' })])[0].source_url).toBeNull()
    expect(run([ev({ link: 'https://eonet.gsfc.nasa.gov/' + 'a'.repeat(300) })])[0].source_url).toBeNull()
    expect(run([ev()])[0].source_url).toBe('https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1')
  })
  it('an event expired 72 h after its newest point is dropped', () => {
    expect(run([ev()], NOW + 67 * H)).toEqual([]) // newest point 06:00, +72 h = 06:00 on the 7th = NOW + 66 h
  })
  it('a payload that is not the EONET shape fails the source; a good empty list is fine', () => {
    for (const bad of [null, undefined, {}, { events: 'x' }, '<html>blocked</html>', []]) expect(parseEonet(bad, NOW), JSON.stringify(bad)).toBeNull()
    expect(parseEonet({ events: [] }, NOW)).toEqual([])
  })
})
