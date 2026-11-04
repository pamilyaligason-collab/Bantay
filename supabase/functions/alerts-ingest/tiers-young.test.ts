// @vitest-environment node
// R7: a raise on a row still under 2 h old is sent before the upsert too, so one failed notice cannot lose it when the row passes 2 h. R6: a slow run skips the awareness feeds.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Existing, type Port, runIngest, SKIP_AFTER_MS, SOURCES, type UpsertRow } from './ingest.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const NOW = 1792240000000 // 2026-10-17 12:26:40 UTC
const ID = 'gdacs-TS-1001400'
const gdacs = fx('gdacs.xml')
// the first item becomes a tsunami that STARTED 1 h 55 min before NOW (10:31:40)
const TSUNAMI = gdacs.replace(/gdacs:eventtype>[A-Z]{2}</, 'gdacs:eventtype>TS<').replace('Thu, 15 Oct 2026 00:00:00 GMT', 'Sat, 17 Oct 2026 10:31:40 GMT')
const bodies: Record<string, string> = { USGS: fx('usgs.json'), GDACS: TSUNAMI, PAGASA: fx('pagasa-feed.xml'), EONET: fx('eonet.json'), 'Open-Meteo': fx('air.json') }
const fetched: string[] = []
const fetchText = async (url: string) => {
  const s = SOURCES.find((x) => x.urls.includes(url))!.source
  fetched.push(s)
  if (s === 'USGS') throw new Error('HTTP503')
  return bodies[s]
}

function world(failNotify: { n: number }) {
  const stored = new Map<string, { bulletin: string; previous_bulletin: string | null; level: string | null }>([[ID, { bulletin: 'b', previous_bulletin: null, level: 'Green' }]])
  const seen = new Set<string>()
  const log = { pushes: [] as string[] }
  const port: Port = {
    existing: async () => new Map(stored) as Existing,
    upsert: async (rows: UpsertRow[]) => { for (const r of rows) stored.set(r.id, { bulletin: r.bulletin, previous_bulletin: r.previous_bulletin, level: r.level }) },
    setStale: async () => undefined,
    members: async () => ['a'],
    notify: async (p, t, ref) => {
      if (failNotify.n > 0) { failNotify.n -= 1; throw new Error('rpc') }
      const k = `${p}|${ref}`; if (seen.has(k)) return 0; seen.add(k); log.pushes.push(`${t}|${ref}`); return 1
    },
    flush: async () => undefined
  }
  return { port, log, stored }
}

describe('a raise on a young row is also sent before the level is stored', () => {
  it('first notify fails at 1 h 55 min; the next run (over 2 h) still pushes once; a third writes 0', async () => {
    const { port, log, stored } = world({ n: 1 })
    const r1 = await runIngest(port, fetchText, NOW)
    expect(r1.GDACS.ok).toBe(false)
    expect(stored.get(ID)!.level).toBe('Green')
    const later = NOW + 10 * 60_000 // now 2 h 05 min old
    const r2 = await runIngest(port, fetchText, later)
    expect(r2.GDACS.ok).toBe(true)
    expect(log.pushes).toEqual([`tsunami_warning|${ID}:orange`])
    await runIngest(port, fetchText, later + 60_000)
    expect(log.pushes).toHaveLength(1)
  })
  it('a young raise with no failure pushes exactly once across the pre-upsert and post-upsert sends', async () => {
    const { port, log } = world({ n: 0 })
    await runIngest(port, fetchText, NOW)
    expect(log.pushes).toEqual([`tsunami_warning|${ID}:orange`])
  })
})

describe('a slow run skips the awareness feeds so the heartbeat lands', () => {
  it('past the skip point Open-Meteo and EONET are not fetched and are recorded not ok; the official feeds still ran', async () => {
    fetched.length = 0
    const { port } = world({ n: 0 })
    let t = 0
    const clock = () => (t += SKIP_AFTER_MS / 2 + 1) // 0.5 per read: the start, then the checks
    const r = await runIngest(port, fetchText, NOW, clock)
    expect(r.GDACS.ok).toBe(true)
    expect(r['Open-Meteo']).toEqual({ ok: false, rows: 0 })
    expect(r.EONET).toEqual({ ok: false, rows: 0 })
    expect(fetched).not.toContain('Open-Meteo')
    expect(fetched).not.toContain('EONET')
  })
  it('a fast run fetches every source', async () => {
    fetched.length = 0
    const { port } = world({ n: 0 })
    await runIngest(port, fetchText, NOW, () => 0)
    expect(fetched).toContain('Open-Meteo')
    expect(fetched).toContain('EONET')
  })
})
