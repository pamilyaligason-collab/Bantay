// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PackRow } from '../../db'
import { cleanup, downloadHazards, downloadOrder, entriesFor, loadPack, type PackFile, type PackIndex, PINNED, resetIndexCache, type Store, syncPacks } from './packs'

const BASE = 'https://files.test/region-packs/'
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex')
const file = (code: string, ids: string[] = []): PackFile => ({ format: 1, province: code, name: `Unit ${code}`, neighbours: [], places: ids.map((id) => ({ id, psgc: code, kind: 'evac', name: `Place ${id}`, address: null, phones: [], lat: null, lon: null, capacity: null, status: 'confirmed' as const, source: 'Invented source', url: null, licence: 'test', dated: null, verified: '2026-10-01', confidence: 'high' })) })

const CODES = ['A1', 'N1', 'N2', ...PINNED]
const bodies: Record<string, string> = Object.fromEntries(CODES.map((c) => [c, JSON.stringify(file(c, [`${c}-p`]))]))
const HAZ = new TextEncoder().encode('fake pmtiles bytes')
const index = (over: Partial<Record<string, string>> = {}): PackIndex => ({
  format: 1, built: '2026-11-04',
  packs: CODES.map((c) => ({
    code: c, name: c, version: 1, checksum: over[c] ?? sha(bodies[c]!), size: 1, rows: 1, path: `${c}/${c}.json`, neighbours: c === 'A1' ? ['N1', 'N2'] : [],
    ...(c === 'A1' ? { hazards: { pack: 'A1', version: 1, checksum: sha(HAZ), size: HAZ.length, path: 'A1/hazards.pmtiles', bounds: { flood: [0, 0, 1, 1] } } } : {})
  }))
})

function server(idx: PackIndex, served: Record<string, string | Uint8Array> = {}) {
  const calls: string[] = []
  const f = (async (url: string) => {
    calls.push(url.replace(BASE, ''))
    const rel = url.replace(BASE, '')
    if (rel === 'index.json') return new Response(JSON.stringify(idx))
    const body = served[rel] ?? (rel.endsWith('hazards.pmtiles') ? HAZ : bodies[rel.split('/')[0]!])
    return body === undefined ? new Response('', { status: 404 }) : new Response(body as BodyInit)
  }) as unknown as typeof fetch
  return { f, calls }
}
function memStore(rows: PackRow[] = []): Store & { rows: Map<string, PackRow> } {
  const m = new Map(rows.map((r) => [r.code, r]))
  return { rows: m, get: async (c) => m.get(c), put: async (r) => void m.set(r.code, r), all: async () => [...m.values()], remove: async (c) => void m.delete(c) }
}
const row = (code: string, usedAt: number, pinned = false): PackRow => ({ code, version: 1, checksum: 'x', name: code, neighbours: [], places: [], fetchedAt: usedAt, usedAt, pinned })

beforeEach(() => resetIndexCache())

describe('downloadOrder', () => {
  it('is current unit, then pinned home units, then neighbours only when allowed; unknown codes are dropped', () => {
    expect(downloadOrder(index(), 'A1', false)).toEqual(['A1', ...PINNED])
    expect(downloadOrder(index(), 'A1', true)).toEqual(['A1', ...PINNED, 'N1', 'N2'])
    expect(downloadOrder(index(), 'ZZ', true)).toEqual([...PINNED])
    expect(downloadOrder(index(), null, true)).toEqual([...PINNED])
  })
})

describe('syncPacks', () => {
  it('downloads the current unit first, then the home units, and stores them', async () => {
    const s = server(index()), store = memStore()
    const r = await syncPacks('A1', { fetch: s.f, base: BASE, store, now: 1000, wifi: false })
    expect(r.fetched).toEqual(['A1', ...PINNED])
    expect(s.calls).toEqual(['index.json', 'A1/A1.json', ...PINNED.map((c) => `${c}/${c}.json`)])
    expect(store.rows.get('A1')).toMatchObject({ version: 1, name: 'Unit A1', pinned: false, usedAt: 1000 })
    expect(store.rows.get(PINNED[0])!.pinned).toBe(true)
  })
  it('does not fetch neighbours on mobile data, does on Wi-Fi or after a tap', async () => {
    const a = server(index())
    await syncPacks('A1', { fetch: a.f, base: BASE, store: memStore(), now: 1, wifi: false })
    expect(a.calls.some((c) => c.startsWith('N1'))).toBe(false)
    resetIndexCache()
    const b = server(index())
    await syncPacks('A1', { fetch: b.f, base: BASE, store: memStore(), now: 1, wifi: true })
    expect(b.calls).toContain('N1/N1.json')
    resetIndexCache()
    const c = server(index())
    await syncPacks('A1', { fetch: c.f, base: BASE, store: memStore(), now: 1, wifi: false, tapped: true })
    expect(c.calls).toContain('N2/N2.json')
  })
  it('throws away a file whose checksum does not match, and stores it on the next good run', async () => {
    const store = memStore()
    const bad = server(index(), { 'A1/A1.json': 'tampered' })
    const r1 = await syncPacks('A1', { fetch: bad.f, base: BASE, store, now: 1, wifi: false })
    expect(r1.bad).toEqual(['A1'])
    expect(store.rows.has('A1')).toBe(false)
    resetIndexCache()
    const r2 = await syncPacks('A1', { fetch: server(index()).f, base: BASE, store, now: 2, wifi: false })
    expect(r2.fetched).toContain('A1')
    expect(store.rows.has('A1')).toBe(true)
  })
  it('skips a pack whose checksum is unchanged, but marks the current one used', async () => {
    const store = memStore()
    await syncPacks('A1', { fetch: server(index()).f, base: BASE, store, now: 1, wifi: false })
    resetIndexCache()
    const s = server(index())
    const r = await syncPacks('A1', { fetch: s.f, base: BASE, store, now: 5000, wifi: false })
    expect(r.fetched).toEqual([])
    expect(s.calls).toEqual(['index.json'])
    expect(store.rows.get('A1')!.usedAt).toBe(5000)
  })
  it('offline (fetch fails) or no base returns offline and never throws', async () => {
    const down = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect((await syncPacks('A1', { fetch: down, base: BASE, store: memStore(), now: 1 })).offline).toBe(true)
    expect((await syncPacks('A1', { base: null, store: memStore() })).offline).toBe(true)
  })
})

describe('cleanup', () => {
  it('removes unpinned packs unused for more than 60 days, keeps pinned and recent ones', async () => {
    const DAY = 86_400_000, now = 100 * DAY
    const store = memStore([row('old', now - 61 * DAY), row('recent', now - 59 * DAY), row('home', now - 400 * DAY, true)])
    expect(await cleanup(store, now)).toEqual(['old'])
    expect([...store.rows.keys()].sort()).toEqual(['home', 'recent'])
  })
})

describe('downloadHazards', () => {
  it('waits on mobile data unless the member taps', async () => {
    const store = memStore([row('A1', 1)]), s = server(index())
    expect(await downloadHazards('A1', { fetch: s.f, base: BASE, store, wifi: false })).toBe('wait')
    expect(s.calls).toEqual([])
    expect(await downloadHazards('A1', { fetch: s.f, base: BASE, store, wifi: false, tapped: true })).toBe('done')
    expect(store.rows.get('A1')!.hazards!.checksum).toBe(sha(HAZ))
  })
  it('discards a hazard file with the wrong checksum', async () => {
    const store = memStore([row('A1', 1)])
    const s = server(index(), { 'A1/hazards.pmtiles': 'tampered' })
    expect(await downloadHazards('A1', { fetch: s.f, base: BASE, store, wifi: true })).toBe('bad')
    expect(store.rows.get('A1')!.hazards).toBeUndefined()
  })
  it('a unit whose hazard file lives in another unit links to it, also when that file is already on the phone', async () => {
    const idx = index()
    idx.packs.find((p) => p.code === 'N1')!.hazards = { ...idx.packs[0]!.hazards! }
    const store = memStore([row('A1', 1), row('N1', 1)])
    expect(await downloadHazards('N1', { fetch: server(idx).f, base: BASE, store, wifi: true })).toBe('done')
    expect(store.rows.get('N1')!.hazardsFrom).toBe('A1')
    expect(store.rows.get('N1')!.hazards).toBeUndefined()
    resetIndexCache()
    store.rows.set('N1', row('N1', 2)) // link lost (row deleted and re-synced): the file is on the phone, the link must come back without a download
    const s = server(idx)
    expect(await downloadHazards('N1', { fetch: s.f, base: BASE, store, wifi: true })).toBe('done')
    expect(store.rows.get('N1')!.hazardsFrom).toBe('A1')
    expect(s.calls).toEqual(['index.json'])
  })
  it('a unit with no hazard entry gives none', async () => {
    expect(await downloadHazards('N1', { fetch: server(index()).f, base: BASE, store: memStore([row('N1', 1)]), wifi: true })).toBe('none')
  })
})

describe('loadPack / entriesFor', () => {
  it('reads from the phone first and answers entriesFor at once; unknown unit is null and []', async () => {
    const store = memStore([{ ...row('A1', 1), places: file('A1', ['x1', 'x2']).places }])
    expect(entriesFor('A1')).toEqual([])
    const e = await loadPack('A1', store)
    expect(e!.map((x) => x.id)).toEqual(['x1', 'x2'])
    expect(entriesFor('A1')).toHaveLength(2)
    expect(await loadPack('nope', store)).toBeNull()
  })
  it('falls back to the bundled home pack when the phone has none', async () => {
    const e = await loadPack('0701200000', memStore())
    expect(e!.length).toBeGreaterThan(100)
    expect(e!.every((x) => typeof x.name === 'string' && x.source.length > 0)).toBe(true)
  })
})
