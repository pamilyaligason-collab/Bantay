// @vitest-environment node
// Fixtures are real payload shapes (USGS GeoJSON, GDACS RSS, Open-Meteo JSON, 2026-10-17 samples). Some features and items were added
// or edited by hand to cover the filters; the expected values below are hand-calculated, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOME_ZONES } from '../../../src/features/location/geo'
import { type Port, runIngest, SOURCES, type UpsertRow } from './ingest.ts'
import { distanceKm, nearest, parseAir, parseGdacs, parseUsgs, ZONES } from './parse.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const NOW = 1792240000000 // 2026-10-17 12:26 UTC

describe('parseUsgs', () => {
  const rows = parseUsgs(JSON.parse(fx('usgs.json')), NOW)!
  it('keeps only quakes inside the magnitude and distance rules', () => {
    // M3.8 at 15 km (rule 1), M5.1 at 165 km (rule 2), M6.8 at 631 km (rule 3).
    // Dropped: M4.7 at 420 km, M4.7 at 590 km, M3.2 at 15 km, a quarry blast, an unknown magnitude.
    expect(rows.map((r) => r.id)).toEqual(['usgs-us7000near1', 'usgs-us7000mid1', 'usgs-us7000big1'])
  })
  it('maps the fields', () => {
    expect(rows[1]).toMatchObject({
      kind: 'quake', level: 'Magnitude 5.1', title: 'M 5.1 - 20 km W of Ormoc, Philippines', where_text: '20 km W of Ormoc, Philippines',
      when_text: '2026-10-17 18:13 PH time', source: 'USGS', source_url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000mid1',
      issued_at: '2026-10-17T10:13:20.000Z', lat: 11, lon: 124.5, expires_at: '2026-10-18T10:13:20.000Z'
    })
    expect(rows[1].what).toBe('Magnitude 5.1 earthquake, about 165 km from Dampas, Tagbilaran City.')
    expect(rows[1].bulletin).toContain('Depth: 12 km.')
  })
  it('unknown depth and unknown url stay unknown', () => {
    expect(rows[0].bulletin).toContain('Depth: unknown.')
    expect(rows[0].what).toContain('about 15 km')
  })
  it('never promises advance warning', () => {
    for (const r of rows) expect(r.do_now).toMatch(/Do not wait for a message/)
    for (const r of rows) expect(r.do_now.toLowerCase()).not.toContain('bantay')
  })
  it('drops a quake older than 24 hours and rejects a bad payload', () => {
    expect(parseUsgs(JSON.parse(fx('usgs.json')), NOW + 25 * 3_600_000)).toEqual([])
    expect(parseUsgs({ nope: 1 }, NOW)).toBeNull()
    expect(parseUsgs(null, NOW)).toBeNull()
  })
})

describe('zones (D-27)', () => {
  it('the app copy and the function copy are equal', () => expect([...ZONES]).toEqual([...HOME_ZONES]))
  it('Conel is in General Santos, about 409 km from Dampas', () => {
    expect(Math.abs(distanceKm(ZONES[0], ZONES[1]) - 409)).toBeLessThan(5)
  })
  const quake = (id: string, mag: number, lat: number, lon: number) => ({ id, properties: { type: 'earthquake', mag, time: NOW - 3_600_000, place: 'x', title: 'x' }, geometry: { coordinates: [lon, lat, 10] } })
  const ids = (...q: ReturnType<typeof quake>[]) => parseUsgs({ features: q }, NOW)!.map((r) => r.id)
  it('0.45 degrees north of Conel (50 km) at M4.0 is kept, and names Conel', () => {
    // 0.45 deg of latitude = 0.45 * 111.19 = 50.0 km; Dampas is about 360 km away, where M4.0 would be dropped.
    const f = quake('conel50', 4.0, 6.6515121, 125.1878084)
    expect(ids(f)).toEqual(['usgs-conel50'])
    expect(parseUsgs({ features: [f] }, NOW)![0].what).toBe('Magnitude 4.0 earthquake, about 50 km from Conel, General Santos City.')
    expect(nearest({ lat: 6.6515121, lon: 125.1878084 }).zone.id).toBe('conel')
  })
  it('M4.0 about 370 km from Conel and 480 km from Dampas is dropped; M4.6 at Conel +200 km is kept', () => {
    expect(ids(quake('far', 4.0, 8.0, 128))).toEqual([])
    expect(ids(quake('mid', 4.6, 8.0, 125.1878084))).toEqual(['usgs-mid']) // 1.8 deg = 200 km from Conel, M4.6 rule 2
  })
  it('air quality is one row per zone with distinct ids and the zone in where_text', () => {
    const rows = ZONES.flatMap((z) => parseAir({ current: { time: '2026-10-17T13:00', pm2_5: 40, us_aqi: 120 } }, NOW, z)!)
    expect(rows.map((r) => r.id)).toEqual(['air-dampas', 'air-conel'])
    expect(rows[1].where_text).toBe('Conel, General Santos City area (model grid cell, about 11 km wide)')
  })
})

describe('parseGdacs', () => {
  const rows = parseGdacs(fx('gdacs.xml'), NOW)!
  it('keeps current TC/FL/VO/TS events in the Philippines or within 500 km of home', () => {
    // Kept: typhoon (country text), volcano (country text), flood near Cebu (74 km, no country text).
    // Dropped: Pakistan quake (EQ is USGS's job), drought, Cook Islands cyclone (far), an ended flood.
    expect(rows.map((r) => r.id)).toEqual(['gdacs-TC-1001400', 'gdacs-VO-2000100', 'gdacs-FL-3000300'])
  })
  it('maps the typhoon, with XML entities decoded', () => {
    expect(rows[0]).toMatchObject({
      kind: 'gdacs', level: 'Orange', title: 'Orange tropical cyclone BAGYO-26 & track near Samar', where_text: 'BAGYO-26, Philippines',
      when_text: '2026-10-15 08:00 PH time', source: 'GDACS', source_url: 'https://www.gdacs.org/report.aspx?eventtype=TC&eventid=1001400',
      lat: 11.5, lon: 126, issued_at: '2026-10-15T00:00:00.000Z', expires_at: '2026-10-19T06:00:00.000Z'
    })
    expect(rows[0].do_now).toContain('PAGASA')
  })
  it('volcano gets the volcano kind and a 72 hour life', () => {
    expect(rows[1]).toMatchObject({ kind: 'volcano', level: 'Orange', when_text: '2026-10-17 06:00 PH time', expires_at: '2026-10-20T03:00:00.000Z' })
    expect(rows[1].do_now).toContain('PHIVOLCS')
  })
  it('a missing country is unknown, not invented', () => {
    expect(rows[2].where_text).toBe('Location not given')
  })
  it('rejects a payload that is not RSS', () => {
    expect(parseGdacs('<html>blocked</html>', NOW)).toBeNull()
    expect(parseGdacs(undefined, NOW)).toBeNull()
  })
  it('an expired event is dropped', () => {
    expect(parseGdacs(fx('gdacs.xml'), NOW + 5 * 24 * 3_600_000)).toEqual([])
  })
})

describe('parseAir', () => {
  it('real sample at AQI 21: one row, already expired so nothing shows', () => {
    const [r] = parseAir(JSON.parse(fx('air.json')), NOW)!
    expect(r).toMatchObject({ id: 'air-dampas', kind: 'air', level: 'US AQI 21', title: 'Air quality: no warning', when_text: '2026-10-17 21:00 PH time', expires_at: '2026-10-17T12:26:40.000Z', lat: null, lon: null })
  })
  it.each([[112, 'Unhealthy for sensitive groups'], [160, 'Unhealthy'], [250, 'Very unhealthy'], [310, 'Hazardous']])('AQI %i is "%s" and lives 3 hours', (aqi, band) => {
    const [r] = parseAir({ current: { time: '2026-10-17T13:00', pm2_5: 40.4, us_aqi: aqi } }, NOW)!
    expect(r.title).toBe(`Air quality: ${band}`)
    expect(r.expires_at).toBe('2026-10-17T15:26:40.000Z')
    expect(r.what).toContain('model estimate, not an official warning')
    expect(r.what).toContain('40 micrograms')
  })
  it('unknown PM2.5 is left out, an unknown AQI is a failure', () => {
    const [r] = parseAir({ current: { time: '2026-10-17T13:00', pm2_5: null, us_aqi: 120 } }, NOW)!
    expect(r.what).not.toContain('PM2.5')
    expect(parseAir({ current: { time: '2026-10-17T13:00', us_aqi: null } }, NOW)).toBeNull()
    expect(parseAir({ current: { time: 'junk', us_aqi: 50 } }, NOW)).toBeNull()
    expect(parseAir({}, NOW)).toBeNull()
  })
})

// ---- ingest: a failed source keeps its rows and marks them stale
function fakePort(initial: Record<string, { bulletin: string; previous_bulletin: string | null }> = {}) {
  const log = { upserts: [] as UpsertRow[], stale: [] as [string, boolean][] }
  const port: Port = {
    existing: async () => new Map(Object.entries(initial)),
    upsert: async (rows) => void log.upserts.push(...rows),
    setStale: async (s, v) => void log.stale.push([s, v]),
    members: async () => [],
    notify: async () => 0,
    flush: async () => undefined
  }
  return { port, log }
}
const bodies: Record<string, string> = { USGS: fx('usgs.json'), GDACS: fx('gdacs.xml'), PAGASA: fx('pagasa-feed.xml'), 'Open-Meteo': fx('air.json') }
const fetchFor = (fail: string[]) => async (url: string) => {
  const s = SOURCES.find((x) => x.urls.includes(url))!
  if (fail.includes(s.source)) throw new Error('HTTP503')
  return bodies[s.source]
}

describe('runIngest', () => {
  it('upserts every source and clears stale', async () => {
    const { port, log } = fakePort()
    const res = await runIngest(port, fetchFor([]), NOW)
    expect(res).toEqual({ USGS: { ok: true, rows: 3 }, GDACS: { ok: true, rows: 3 }, PAGASA: { ok: true, rows: 0 }, 'Open-Meteo': { ok: true, rows: 2 } }) // PAGASA: the saved feed is 9 days newer than NOW, so no CAP file is in the window
    expect(log.upserts).toHaveLength(8)
    expect(log.upserts.every((r) => r.stale === false && r.fetched_at === '2026-10-17T12:26:40.000Z')).toBe(true)
    expect(log.stale).toEqual([['USGS', false], ['GDACS', false], ['PAGASA', false], ['Open-Meteo', false]])
  })
  it('duplicate ids from one feed yield one upserted row (last wins)', async () => {
    const { port, log } = fakePort()
    const row = { id: 'x', bulletin: 'a' } as never
    const dup = { ...SOURCES[0], parse: () => [row, { id: 'x', bulletin: 'b' } as never] }
    const orig = SOURCES[0].parse
    SOURCES[0].parse = dup.parse
    try { await runIngest(port, fetchFor([]), NOW) } finally { SOURCES[0].parse = orig }
    const x = log.upserts.filter((r) => r.id === 'x')
    expect(x).toHaveLength(1)
    expect(x[0].bulletin).toBe('b')
  })
  it('a failing source is marked stale, writes nothing, and does not stop the others', async () => {
    const { port, log } = fakePort()
    const res = await runIngest(port, fetchFor(['USGS']), NOW)
    expect(res.USGS).toEqual({ ok: false, rows: 0 })
    expect(res.GDACS.ok).toBe(true)
    expect(log.stale).toContainEqual(['USGS', true])
    expect(log.upserts.some((r) => r.source === 'USGS')).toBe(false)
  })
  it('an unexpected payload (HTML block page) counts as failure, not as "no alerts"', async () => {
    const { port, log } = fakePort()
    const res = await runIngest(port, async (u) => (u.includes('gdacs') ? '<html>403</html>' : bodies[SOURCES.find((x) => x.urls.includes(u))!.source]), NOW)
    expect(res.GDACS.ok).toBe(false)
    expect(log.stale).toContainEqual(['GDACS', true])
  })
  it('a failing stale-flag write does not throw out of the run', async () => {
    const { port } = fakePort()
    port.setStale = async () => { throw new Error('write') }
    await expect(runIngest(port, fetchFor(['USGS', 'GDACS', 'PAGASA', 'Open-Meteo']), NOW)).resolves.toMatchObject({ USGS: { ok: false } })
  })
  it('keeps the old bulletin as previous_bulletin when the text changed, and leaves it when not', async () => {
    const { port, log } = fakePort({
      'usgs-us7000mid1': { bulletin: 'older text', previous_bulletin: null },
      'usgs-us7000near1': { bulletin: 'x', previous_bulletin: 'kept' }
    })
    await runIngest(port, fetchFor(['GDACS', 'Open-Meteo']), NOW)
    const by = (id: string) => log.upserts.find((r) => r.id === id)!
    expect(by('usgs-us7000mid1').previous_bulletin).toBe('older text')
    expect(by('usgs-us7000near1').previous_bulletin).toBe('x') // changed again: the latest old text
    expect(by('usgs-us7000big1').previous_bulletin).toBeNull() // new row
  })
})
