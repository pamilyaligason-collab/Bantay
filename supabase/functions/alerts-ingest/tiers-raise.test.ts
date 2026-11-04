// @vitest-environment node
// A raised level is new news even when the event began long ago. The 2-hour age limit only stops a first sighting or an outage from announcing old news.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Port, runIngest, SOURCES, tier1 } from './ingest.ts'
import type { AlertRow } from './parse.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const NOW = 1792240000000 // 2026-10-17 12:26 UTC
const OLD = '2026-10-17T06:00:00.000Z' // event start, 6.4 h before NOW

const row = (o: Partial<AlertRow>): AlertRow => ({
  id: 'r1', kind: 'quake', level: null, title: 't', what: 'w', where_text: 'x', when_text: 'x', do_now: 'x', source: 'S', source_url: null, issued_at: '2026-10-17T12:00:00.000Z',
  lat: 14.6, lon: 121, bulletin: 'b', checklist: null, timeline: null, expires_at: '2026-10-18T12:00:00.000Z', ...o
})
const prior = (id: string, level: string | null) => new Map([[id, { level }]])
const ts = (level: string | null, issued_at = OLD) => row({ id: 'ts', kind: 'tsunami', level, issued_at })

describe('tier1: a raised level pushes whatever the event age', () => {
  it('Green to Orange and Orange to Red push on an old event', () => {
    expect(tier1([ts('Orange')], NOW, prior('ts', 'Green'))).toEqual([{ ref: 'ts:orange', template: 'tsunami_warning' }])
    expect(tier1([ts('Red')], NOW, prior('ts', 'Orange'))).toEqual([{ ref: 'ts:red', template: 'tsunami_warning' }])
  })
  it('a level seen before and unchanged is still too old, and a first sighting of an old event is too old', () => {
    expect(tier1([ts('Orange')], NOW, prior('ts', 'Orange'))).toEqual([])
    expect(tier1([ts('Orange')], NOW, new Map())).toEqual([])
    expect(tier1([ts('Orange')], NOW)).toEqual([])
  })
  it('a downgrade writes nothing new, old or young', () => {
    expect(tier1([ts('Orange')], NOW, prior('ts', 'Red'))).toEqual([])
    expect(tier1([ts('Orange', '2026-10-17T12:00:00.000Z')], NOW, prior('ts', 'Red'))).toEqual([])
    expect(tier1([ts('Green')], NOW, prior('ts', 'Red'))).toEqual([])
  })
  it('Green never pushes, even as a rise from an unknown level', () => expect(tier1([ts('Green')], NOW, prior('ts', null))).toEqual([]))
  it('a volcano raised to level 3 or more pushes on an old row; a rise to level 2 does not', () => {
    const vo = (level: string) => row({ id: 'vo', kind: 'volcano', level, issued_at: OLD })
    expect(tier1([vo('Alert Level 3')], NOW, prior('vo', 'Alert Level 2'))).toEqual([{ ref: 'vo:l3', template: 'volcano_raised' }])
    expect(tier1([vo('Alert Level 2')], NOW, prior('vo', 'Alert Level 1'))).toEqual([])
  })
  it('wind rows are exactly as before: a prior level changes nothing', () => {
    expect(tier1([row({ id: 'p', kind: 'tcws', level: 'Signal No. 2', issued_at: OLD })], NOW, prior('p', 'Signal No. 3'))).toEqual([{ ref: 'p:s2', template: 'storm_warning' }])
  })
  it('a whole run: an old tsunami row stored at Green and now Orange notifies once, and a rerun writes 0', async () => {
    const seen = new Set<string>(); const rows: string[] = []
    const port: Port = {
      existing: async () => new Map([['gdacs-TS-1001400', { bulletin: 'b', previous_bulletin: null, level: 'Green' }]]), upsert: async () => undefined, setStale: async () => undefined, members: async () => ['a'],
      notify: async (p, t, ref) => { const k = `${p}|${ref}`; if (seen.has(k)) return 0; seen.add(k); rows.push(`${t}|${ref}`); return 1 }, flush: async () => undefined
    }
    const gdacs = fx('gdacs.xml')
    // the first item becomes a tsunami that STARTED 17 Oct 04:00 UTC (8 h before NOW), still inside its 12 h life
    const g = gdacs.replace(/gdacs:eventtype>[A-Z]{2}</, 'gdacs:eventtype>TS<').replace('Thu, 15 Oct 2026 00:00:00 GMT', 'Sat, 17 Oct 2026 04:00:00 GMT')
    expect(g).not.toBe(gdacs)
    const bodies: Record<string, string> = { USGS: fx('usgs.json'), GDACS: g, PAGASA: fx('pagasa-feed.xml'), EONET: fx('eonet.json'), 'Open-Meteo': fx('air.json') }
    const fetchText = async (url: string) => {
      const s = SOURCES.find((x) => x.urls.includes(url))!.source
      if (s === 'USGS') throw new Error('HTTP503')
      return bodies[s]
    }
    await runIngest(port, fetchText, NOW)
    expect(rows).toEqual(['tsunami_warning|gdacs-TS-1001400:orange'])
    await runIngest(port, fetchText, NOW)
    expect(rows).toHaveLength(1)
  })
})
