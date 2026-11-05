// @vitest-environment node
// D-121: a row the source stops listing is ended (expires_at = now), after a good non-empty read, once its own fetched_at is past the grace. Invented ids and times.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DROP_GRACE_MS, type Port, RETRY_FIRST_ROUND_MS, runIngest, SOURCES } from './ingest.ts'
import { gdacsCurrentIds, parseGdacs } from './parse.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const NOW = 1792240000000
const H = 3_600_000
const LISTED = parseGdacs(fx('gdacs.xml'), NOW)![0].id // a row the saved feed still lists
const row = (fetchedAgo: number, expiresIn = 24 * H, stale = false) => ({ stale, bulletin: 'b', previous_bulletin: null, fetched_at: new Date(NOW - fetchedAgo).toISOString(), expires_at: new Date(NOW + expiresIn).toISOString() })

function setup(initial: Record<string, ReturnType<typeof row>>) {
  const ended: { ids: string[]; at: string }[] = []
  const notified: string[] = []
  const port: Port = {
    existing: async (s) => new Map(s === 'GDACS' || s === 'USGS' ? Object.entries(initial) : []),
    upsert: async () => undefined,
    setStale: async () => undefined,
    end: async (ids, at) => void ended.push({ ids, at }),
    members: async () => ['p1'],
    notify: async (_p, _t, ref) => (notified.push(ref), 1),
    flush: async () => undefined
  }
  return { port, ended, notified }
}
const bodies: Record<string, string> = { USGS: fx('usgs.json'), GDACS: fx('gdacs.xml'), PAGASA: fx('pagasa-feed.xml'), EONET: fx('eonet.json'), 'Open-Meteo': fx('air.json') }
const fetchFor = (fail: string[] = []) => async (url: string) => {
  const s = SOURCES.find((x) => x.urls.includes(url))!
  if (fail.includes(s.source)) throw new Error('HTTP503')
  return bodies[s.source]
}
const endedIds = (e: { ids: string[] }[]) => e.flatMap((x) => x.ids)

describe('D-121 dropped rows end', () => {
  it('only GDACS opts in, and it reads ids from the raw feed', () => {
    expect(SOURCES.filter((s) => s.endsDropped).map((s) => s.source)).toEqual(['GDACS'])
    expect(gdacsCurrentIds(bodies.GDACS).size).toBeGreaterThan(parseGdacs(bodies.GDACS, NOW)!.length) // raw list is wider than the zone-filtered rows
  })
  it('a row the parser filters out (far from the zones) but the feed still lists as current stays', async () => {
    const far = 'gdacs-TC-1001339' // a tropical cyclone in the saved feed, outside the zone filter
    expect(gdacsCurrentIds(bodies.GDACS).has(far)).toBe(true)
    expect(parseGdacs(bodies.GDACS, NOW)!.some((r) => r.id === far)).toBe(false)
    const { port, ended } = setup({ [far]: row(10 * H) })
    await runIngest(port, fetchFor(), NOW)
    expect(endedIds(ended)).toEqual([])
  })
  it('a row the feed lists with iscurrent=false ends', async () => {
    const id = [...gdacsCurrentIds(bodies.GDACS)][0]
    const [, type, eid] = /^gdacs-([A-Z]+)-(\d+)$/.exec(id)!
    const off = bodies.GDACS.replace(/<item>[\s\S]*?<\/item>/g, (item) => (item.includes(`<gdacs:eventid>${eid}</gdacs:eventid>`) && item.includes(`<gdacs:eventtype>${type}<`) ? item.replace('<gdacs:iscurrent>true<', '<gdacs:iscurrent>false<') : item))
    expect(type).toBeTruthy()
    expect(gdacsCurrentIds(off).has(id)).toBe(false)
    const { port, ended } = setup({ [id]: row(10 * H) })
    await runIngest(port, async (u) => (SOURCES.find((x) => x.urls.includes(u))!.source === 'GDACS' ? off : bodies[SOURCES.find((x) => x.urls.includes(u))!.source]), NOW)
    expect(endedIds(ended)).toEqual([id])
  })
  it('a dropped row older than the grace is ended at now, and nothing is pushed', async () => {
    const { port, ended, notified } = setup({ 'gdacs-VO-gone': row(DROP_GRACE_MS + 60_000) })
    await runIngest(port, fetchFor(), NOW)
    expect(ended).toEqual([{ ids: ['gdacs-VO-gone'], at: new Date(NOW).toISOString() }])
    expect(notified.filter((r) => r.includes('gone'))).toEqual([]) // other sources' own notices are not about the ended row
  })
  it('a dropped row inside the grace stays', async () => {
    const { port, ended } = setup({ 'gdacs-VO-gone': row(DROP_GRACE_MS - 60_000) })
    await runIngest(port, fetchFor(), NOW)
    expect(endedIds(ended)).toEqual([])
  })
  it('a row the feed still lists stays, however old its fetched_at', async () => {
    const { port, ended } = setup({ [LISTED]: row(10 * H), 'gdacs-VO-gone': row(10 * H) })
    await runIngest(port, fetchFor(), NOW)
    expect(endedIds(ended)).toEqual(['gdacs-VO-gone'])
  })
  it('an already expired row is not touched', async () => {
    const { port, ended } = setup({ 'gdacs-VO-gone': row(10 * H, -H) })
    await runIngest(port, fetchFor(), NOW)
    expect(endedIds(ended)).toEqual([])
  })
  it('a raw feed with no items ends nothing', async () => {
    const { port, ended } = setup({ 'gdacs-VO-gone': row(10 * H) })
    const empty = '<rss><channel></channel></rss>'
    const res = await runIngest(port, async (u) => (SOURCES.find((x) => x.urls.includes(u))!.source === 'GDACS' ? empty : bodies[SOURCES.find((x) => x.urls.includes(u))!.source]), NOW)
    expect(res.GDACS).toEqual({ ok: true, rows: 0 })
    expect(endedIds(ended)).toEqual([])
  })
  it('a healthy feed with no nearby item still ends the dropped row', async () => {
    const { port, ended } = setup({ 'gdacs-VO-gone': row(10 * H, 200 * H) })
    const res = await runIngest(port, fetchFor(), NOW + 5 * 24 * H) // saved items all expired by then: parser rows [], raw list not empty
    expect(res.GDACS).toEqual({ ok: true, rows: 0 })
    expect(endedIds(ended)).toEqual(['gdacs-VO-gone'])
  })
  it('after an outage (a row still stale) nothing ends on the first good read', async () => {
    const { port, ended } = setup({ 'gdacs-VO-gone': row(10 * H), 'gdacs-VO-other': row(10 * H, 24 * H, true) })
    await runIngest(port, fetchFor(), NOW)
    expect(endedIds(ended)).toEqual([])
  })
  it('a failed read ends nothing', async () => {
    const { port, ended } = setup({ 'gdacs-VO-gone': row(10 * H) })
    await runIngest(port, fetchFor(['GDACS']), NOW)
    expect(endedIds(ended)).toEqual([])
  })
  it('a source not opted in ends nothing', async () => {
    const { port, ended } = setup({ 'usgs-gone': row(10 * H) })
    await runIngest(port, fetchFor(['GDACS']), NOW)
    expect(endedIds(ended)).toEqual([])
  })
  it('a failing end write does not fail the read', async () => {
    const { port } = setup({ 'gdacs-VO-gone': row(10 * H) })
    port.end = async () => { throw new Error('write') }
    expect((await runIngest(port, fetchFor(), NOW)).GDACS.ok).toBe(true)
  })
  it('one failed read then a good one counts as ok (first-round urls retry once)', async () => {
    const { port } = setup({})
    const calls: Record<string, number> = {}
    const flaky = async (u: string) => {
      const src = SOURCES.find((x) => x.urls.includes(u))!.source
      calls[src] = (calls[src] ?? 0) + 1
      if (src === 'GDACS' && calls[src] === 1) throw new Error('HTTP503')
      return bodies[src]
    }
    expect((await runIngest(port, flaky, NOW)).GDACS.ok).toBe(true)
    expect(calls.GDACS).toBe(2)
  })
  it('past the first-round retry window a fetch is tried once', async () => {
    const { port } = setup({})
    let t = 0
    const calls: Record<string, number> = {}
    const slow = async (u: string) => {
      const src = SOURCES.find((x) => x.urls.includes(u))!.source
      calls[src] = (calls[src] ?? 0) + 1
      if (src === 'USGS') t = RETRY_FIRST_ROUND_MS + 1 // the first source takes the run past the window
      if (src === 'GDACS') throw new Error('HTTP503')
      return bodies[src]
    }
    expect((await runIngest(port, slow, NOW, () => t)).GDACS.ok).toBe(false)
    expect(calls.GDACS).toBe(1)
  })
})
