// @vitest-environment node
// Fixtures are real PAGASA public-alert payloads (feed + CAP, fetched read-only 2026-10-26, Signature blocks removed). The real wind-signal CAPs of that week
// name northern Luzon, so the home-zone cases swap one areaDesc to Bohol or South Cotabato; every expected value below is hand-calculated.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { notifyTier1, type Port, runIngest, SOURCES, tier1, type UpsertRow } from './ingest.ts'
import { capUrls, parseCap, parseFeed, parsePagasa, signalOf, stormOf } from './pagasa.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const at = (iso: string) => Date.parse(iso)
const feed = fx('pagasa-feed.xml')
const wcp = fx('pagasa-wcp.cap') // Signal #1, Batanes, sent 2026-10-24 04:50:38+08, expires 16:50:27+08
const acp = fx('pagasa-acp.cap') // Tropical Cyclone Alert, sent 2026-10-24 10:52:06+08
const gfa = fx('pagasa-gfa-bohol.cap') // General Flood Advisory, Cebu + Bohol polygons, sent 2026-10-25 17:27:04+08, expires 2026-10-26 05:27:04+08
const gfaFinal = fx('pagasa-gfa-final.cap') // Final (AllClear), references the one above, sent 2026-10-26 05:22:53+08
const inArea = (cap: string, area: string) => cap.replace('<areaDesc>Batanes</areaDesc>', `<areaDesc>${area}</areaDesc>`)
const sig2 = (cap: string) => inArea(cap, 'Bohol').replace('Signal Level</valueName><value>1', 'Signal Level</valueName><value>2').replace('<identifier>21b29a06-e297-47bd-a79d-20826e724a2c', '<identifier>sig2-id').replace('Signal #1', 'Signal #2')

describe('feed shape', () => {
  it('the saved index is an Atom feed with four CAP entries, newest first', () => {
    const e = parseFeed(feed)!
    expect(e.map((x) => x.type)).toEqual(['gfa', 'gfa', 'acp', 'wcp'])
    expect(e[3]).toMatchObject({ title: 'Tropical Cyclone Warning : Typhoon Rosal (CHAMPI) Signal #1', url: 'https://publicalert.pagasa.dost.gov.ph/output/wcp/21b29a06-e297-47bd-a79d-20826e724a2c.cap' })
    expect(feed).toContain('Licensed under CC BY 4.0')
  })
  it('rejects a page that is not the feed', () => {
    expect(parseFeed('<html>403</html>')).toBeNull()
    expect(parseFeed(null)).toBeNull()
    expect(parsePagasa(['<html></html>'], 0)).toBeNull()
  })
  it('fetches only CAP files updated in the last 30 hours', () => {
    const e = parseFeed(feed)!
    expect(capUrls(e, at('2026-10-26T06:00:00+08:00')).map((u) => u.split('/').pop())).toEqual(['da3e8383-a066-49ed-99ef-8dd3fe93fb55.cap', 'f1232c02-5d52-4786-90aa-46865ab991a4.cap']) // updated 10-25 00:00 or later
    expect(capUrls(e, at('2026-10-17T12:00:00+08:00'))).toEqual([])
  })
  it('reads a wind-signal CAP', () => {
    expect(parseCap(wcp)).toMatchObject({ id: '21b29a06-e297-47bd-a79d-20826e724a2c', type: 'wcp', signal: 1, msgType: 'Alert', expires: at('2026-10-24T16:50:27+08:00'), areas: [{ name: 'Batanes', poly: null }] })
    expect(parseCap(acp)!.refs).toEqual(['21b29a06-e297-47bd-a79d-20826e724a2c'])
    expect(parseCap('<alert><identifier>x</identifier></alert>')).toBeNull()
    expect(stormOf('Tropical Cyclone Warning : Typhoon Rosal (CHAMPI) Signal #1')).toBe('Typhoon Rosal (CHAMPI)')
  })
})

describe('tier 1: wind signals', () => {
  const NOW = at('2026-10-24T08:00:00+08:00')
  const run = (caps: string[], now = NOW) => parsePagasa([feed, ...caps], now)!
  it('a signal over northern Luzon makes no row for our zones', () => expect(run([wcp])).toEqual([]))
  it('Signal 1 over Bohol is one tcws row for Dampas, expiring with the bulletin', () => {
    const rows = run([inArea(wcp, 'Bohol')])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'pagasa-tcws-rosal-champi-dampas', kind: 'tcws', level: 'Signal No. 1', source: 'PAGASA', lat: 9.645705, lon: 123.877951,
      title: 'Wind Signal No. 1 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)', where_text: 'Bohol (near Dampas, Tagbilaran City)',
      when_text: '2026-10-24 04:50 PH time', issued_at: '2026-10-23T20:50:38.000Z', expires_at: '2026-10-24T08:50:27.000Z'
    })
    expect(rows[0].what).toContain('Winds of 39-61 kph')
    expect(rows[0].bulletin).toContain('Source: PAGASA, CC BY 4.0.')
  })
  it('South Cotabato is the Conel zone', () => {
    expect(run([inArea(wcp, 'South Cotabato, Sarangani')]).map((r) => [r.id, r.where_text])).toEqual([['pagasa-tcws-rosal-champi-conel', 'South Cotabato, Sarangani (near Conel, General Santos City)']])
  })
  it('two signals in one bulletin: the higher one wins, one row per storm and zone', () => {
    const rows = run([inArea(wcp, 'Bohol'), sig2(wcp)])
    expect(rows.map((r) => r.level)).toEqual(['Signal No. 2'])
  })
  it('a later Tropical Cyclone Alert lifts the signal: the row is written already expired', () => {
    const now = at('2026-10-24T11:30:00+08:00')
    const rows = run([inArea(wcp, 'Bohol'), acp], now)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ level: null, title: 'Wind signal lifted for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)', expires_at: new Date(now).toISOString() })
  })
  it('an expired bulletin with nothing newer writes nothing', () => expect(run([inArea(wcp, 'Bohol')], at('2026-10-24T17:00:00+08:00'))).toEqual([]))
  it('notices: live signals only, the ref carries the signal', () => {
    expect(tier1(run([inArea(wcp, 'Bohol')]), NOW)).toEqual([{ ref: 'pagasa-tcws-rosal-champi-dampas:s1', template: 'storm_warning' }])
    expect(tier1(run([inArea(wcp, 'Bohol'), sig2(wcp)]), NOW)[0].ref).toBe('pagasa-tcws-rosal-champi-dampas:s2')
    expect(tier1(run([inArea(wcp, 'Bohol'), acp], at('2026-10-24T11:30:00+08:00')), at('2026-10-24T11:30:00+08:00'))).toEqual([])
    expect(signalOf('Signal No. 4')).toBe(4)
    expect(signalOf(null)).toBeNull()
  })
})

describe('tier 2: general flood advisory', () => {
  it('Bohol is inside the Dampas polygon; Conel is not', () => {
    const rows = parsePagasa([feed, gfa], at('2026-10-25T18:00:00+08:00'))!
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'pagasa-rain-dampas', kind: 'rainfall', level: 'Moderate', title: 'General Flood Advisory for Dampas, Tagbilaran City',
      where_text: 'Bohol (near Dampas, Tagbilaran City)', expires_at: '2026-10-25T21:27:04.000Z', source: 'PAGASA'
    })
    expect(rows[0].do_now).toContain('Do not walk or drive through floodwater')
    expect(tier1(rows, at('2026-10-25T18:00:00+08:00'))).toEqual([]) // tier 2 never notifies
  })
  it('the Final advisory replaces it and ends the row', () => {
    const now = at('2026-10-26T06:00:00+08:00')
    const rows = parsePagasa([feed, gfa, gfaFinal], now)!
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'pagasa-rain-dampas', level: null, title: 'Flood advisory ended for Dampas, Tagbilaran City', expires_at: new Date(now).toISOString() })
  })
  it('an advisory that lapsed on its own writes nothing', () => expect(parsePagasa([feed, gfa], at('2026-10-26T06:00:00+08:00'))).toEqual([]))
})

// ---- notification: fake port with the same unique (person, ref) rule as carer_alerts_ref
function notifyPort(people: string[]) {
  const seen = new Set<string>()
  const log = { flushes: 0, rows: [] as string[] }
  const port: Port = {
    existing: async () => new Map(),
    upsert: async () => undefined,
    setStale: async () => undefined,
    members: async () => people,
    notify: async (p, t, ref) => {
      const k = `${p}|${ref}`
      if (seen.has(k)) return 0
      seen.add(k)
      log.rows.push(`${p}|${t}|${ref}`)
      return 1
    },
    flush: async () => void (log.flushes += 1)
  }
  return { port, log }
}

describe('notifyTier1', () => {
  const NOW = at('2026-10-24T08:00:00+08:00')
  const rows = parsePagasa([feed, inArea(wcp, 'Bohol')], NOW)!
  it('a new tier-1 row writes one hazard row per member, then one flush; a rerun writes none', async () => {
    const { port, log } = notifyPort(['a', 'b', 'c'])
    expect(await notifyTier1(port, rows, NOW)).toBe(3)
    expect(log.rows).toEqual(['a|storm_warning|pagasa-tcws-rosal-champi-dampas:s1', 'b|storm_warning|pagasa-tcws-rosal-champi-dampas:s1', 'c|storm_warning|pagasa-tcws-rosal-champi-dampas:s1'])
    expect(log.flushes).toBe(1)
    expect(await notifyTier1(port, rows, NOW)).toBe(0)
    expect(log.flushes).toBe(1) // nothing new: no flush
  })
  it('a raised signal notifies again', async () => {
    const { port } = notifyPort(['a'])
    await notifyTier1(port, rows, NOW)
    expect(await notifyTier1(port, parsePagasa([feed, sig2(wcp)], NOW)!, NOW)).toBe(1)
  })
  it('no tier-1 row means no member lookup and no flush', async () => {
    const { port, log } = notifyPort(['a'])
    port.members = async () => { throw new Error('should not be called') }
    expect(await notifyTier1(port, parsePagasa([feed, gfa], at('2026-10-25T18:00:00+08:00'))!, NOW)).toBe(0)
    expect(log.flushes).toBe(0)
  })
  it('one failing member does not stop the others and never throws', async () => {
    const { port, log } = notifyPort(['a', 'b'])
    const ok = port.notify
    port.notify = async (p, t, r) => { if (p === 'a') throw new Error('write'); return ok(p, t, r) }
    expect(await notifyTier1(port, rows, NOW)).toBe(1)
    expect(log.flushes).toBe(1)
    port.members = async () => { throw new Error('read') }
    await expect(notifyTier1(port, rows, NOW)).resolves.toBe(0)
  })
})

// ---- the whole run: index, CAP fetch, upsert, notify
describe('runIngest with the PAGASA source', () => {
  const NOW = at('2026-10-24T08:00:00+08:00')
  const other = acp.replaceAll('Rosal', 'Maring').replaceAll('CHAMPI', 'OTHER') // a different storm's alert must not lift Rosal
  const bodies = (fail?: (u: string) => boolean) => async (url: string): Promise<string> => {
    if (fail?.(url)) throw new Error('HTTP503')
    if (url.endsWith('/feeds/')) return feed
    if (url.includes('/wcp/')) return inArea(wcp, 'Bohol')
    if (url.includes('/acp/')) return other
    if (url.includes('/gfa/')) return gfa
    const s = SOURCES.find((x) => x.urls.includes(url))!
    return s.source === 'USGS' ? fx('usgs.json') : s.source === 'GDACS' ? fx('gdacs.xml') : fx('air.json')
  }
  const mk = () => {
    const up: UpsertRow[] = []
    const stale: [string, boolean][] = []
    const { port, log } = notifyPort(['m1', 'm2'])
    port.upsert = async (r) => void up.push(...r)
    port.setStale = async (s, v) => void stale.push([s, v])
    return { port, log, up, stale }
  }
  it('upserts the tcws row, notifies each member once, and a rerun notifies nobody', async () => {
    const { port, log, up } = mk()
    const res = await runIngest(port, bodies(), NOW)
    expect(res.PAGASA.ok).toBe(true)
    expect(up.filter((r) => r.kind === 'tcws').map((r) => r.id)).toEqual(['pagasa-tcws-rosal-champi-dampas'])
    expect(log.rows).toHaveLength(2)
    await runIngest(port, bodies(), NOW)
    expect(log.rows).toHaveLength(2)
  })
  it('a CAP file that stays unreachable fails PAGASA only (stale, nothing written, no notice); GDACS and Open-Meteo still run', async () => {
    const { port, log, up, stale } = mk()
    const res = await runIngest(port, bodies((u) => u.includes('/wcp/')), NOW)
    expect(res.PAGASA).toEqual({ ok: false, rows: 0 })
    expect(res.GDACS.ok && res['Open-Meteo'].ok).toBe(true)
    expect(stale).toContainEqual(['PAGASA', true])
    expect(up.some((r) => r.source === 'PAGASA')).toBe(false)
    expect(log.rows).toEqual([])
  })
  it('one failed CAP fetch is retried once', async () => {
    const { port, up } = mk()
    let n = 0
    const f = bodies()
    const res = await runIngest(port, async (u) => { if (u.includes('/wcp/') && n++ === 0) throw new Error('HTTP503'); return f(u) }, NOW)
    expect(res.PAGASA.ok).toBe(true)
    expect(up.some((r) => r.kind === 'tcws')).toBe(true)
  })
  it('a feed index that is a block page counts as failure', async () => {
    const { port, stale } = mk()
    const f = bodies()
    const res = await runIngest(port, async (u) => (u.endsWith('/feeds/') ? '<html>403</html>' : f(u)), NOW)
    expect(res.PAGASA.ok).toBe(false)
    expect(stale).toContainEqual(['PAGASA', true])
  })
})
