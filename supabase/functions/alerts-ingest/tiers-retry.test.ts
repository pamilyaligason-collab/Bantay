// @vitest-environment node
// F4: a raised level on an old event is stored with the row. If the notice fails, the stored level must not move, so the next run still sees the rise and retries. No double push.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Existing, type Port, runIngest, SOURCES, type UpsertRow } from './ingest.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const NOW = 1792240000000 // 2026-10-17 12:26 UTC
const ID = 'gdacs-TS-1001400'
const gdacs = fx('gdacs.xml')
// the first item becomes a tsunami that STARTED 8 h before NOW and is still inside its 12 h life
const TSUNAMI = gdacs.replace(/gdacs:eventtype>[A-Z]{2}</, 'gdacs:eventtype>TS<').replace('Thu, 15 Oct 2026 00:00:00 GMT', 'Sat, 17 Oct 2026 04:00:00 GMT')
const bodies: Record<string, string> = { USGS: fx('usgs.json'), GDACS: TSUNAMI, PAGASA: fx('pagasa-feed.xml'), EONET: fx('eonet.json'), 'Open-Meteo': fx('air.json') }
const fetchText = async (url: string) => {
  const s = SOURCES.find((x) => x.urls.includes(url))!.source
  if (s === 'USGS') throw new Error('HTTP503')
  return bodies[s]
}

function world(failNotify: { n: number }) {
  const stored = new Map<string, { bulletin: string; previous_bulletin: string | null; level: string | null }>([[ID, { bulletin: 'b', previous_bulletin: null, level: 'Green' }]])
  const seen = new Set<string>()
  const log = { pushes: [] as string[], stale: [] as string[], upserts: 0 }
  const port: Port = {
    existing: async () => new Map(stored) as Existing,
    upsert: async (rows: UpsertRow[]) => { log.upserts += 1; for (const r of rows) stored.set(r.id, { bulletin: r.bulletin, previous_bulletin: r.previous_bulletin, level: r.level }) },
    setStale: async (s, st) => { if (st) log.stale.push(s) },
    members: async () => ['a'],
    notify: async (p, t, ref) => {
      if (failNotify.n > 0) { failNotify.n -= 1; throw new Error('rpc') }
      const k = `${p}|${ref}`; if (seen.has(k)) return 0; seen.add(k); log.pushes.push(`${t}|${ref}`); return 1
    },
    flush: async () => undefined
  }
  return { port, log, stored }
}

describe('a failed notice on a raised old event is retried by the next run', () => {
  it('first notify throws: the level is not stored, the source is marked stale; the next run pushes once; a third writes 0', async () => {
    const fail = { n: 1 }
    const { port, log, stored } = world(fail)
    const r1 = await runIngest(port, fetchText, NOW)
    expect(r1.GDACS.ok).toBe(false)
    expect(log.pushes).toEqual([])
    expect(stored.get(ID)!.level).toBe('Green') // still the old level, so the rise is visible again
    expect(log.stale).toContain('GDACS')
    const r2 = await runIngest(port, fetchText, NOW)
    expect(r2.GDACS.ok).toBe(true)
    expect(log.pushes).toEqual([`tsunami_warning|${ID}:orange`])
    expect(stored.get(ID)!.level).toBe('Orange')
    await runIngest(port, fetchText, NOW)
    expect(log.pushes).toHaveLength(1) // no double push
  })
  it('members() failing behaves the same', async () => {
    const { port, log, stored } = world({ n: 0 })
    let calls = 0
    const members = port.members
    port.members = async () => { calls += 1; if (calls === 1) throw new Error('read'); return members() }
    const r1 = await runIngest(port, fetchText, NOW)
    expect(r1.GDACS.ok).toBe(false)
    expect(stored.get(ID)!.level).toBe('Green')
    await runIngest(port, fetchText, NOW)
    expect(log.pushes).toEqual([`tsunami_warning|${ID}:orange`])
  })
})
