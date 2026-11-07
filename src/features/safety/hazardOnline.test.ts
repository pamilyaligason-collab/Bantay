// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { P, pmtilesFile, tileBytes } from '../../../e2e/fixtures/p2/pmtilesFixture'
import { hazardsOnline, parseHeader, resetOnlineCache, urlBytes } from './hazardLookup'

// An invented file served by a fake host that honours (or ignores) Range.
const body = (b: Uint8Array) => b as unknown as BodyInit
const file = pmtilesFile(tileBytes(), false)
const URL1 = 'https://example.test/storage/v1/object/public/region-packs/hazards/invented.pmtiles'
function host(honour = true) {
  const calls: { range: string | null }[] = []
  const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('Range')
    calls.push({ range })
    if (!honour || !range) return new Response(body(file), { status: 200 })
    const [a, b] = range.replace('bytes=', '').split('-').map(Number) as [number, number]
    return new Response(body(file.subarray(a, b + 1)), { status: 206 })
  })
  return { f: f as unknown as typeof fetch, calls }
}
beforeEach(() => resetOnlineCache())

describe('urlBytes (HTTP Range source)', () => {
  it('asks for exactly the bytes wanted, as an inclusive Range header, and returns them', async () => {
    const { f, calls } = host()
    const out = await urlBytes(URL1, f).get(0, 8)
    expect(calls[0]!.range).toBe('bytes=0-7')
    expect([...out]).toEqual([...file.subarray(0, 8)])
    expect(String.fromCharCode(...out.subarray(0, 7))).toBe('PMTiles')
  })
  it('refuses a host that ignores Range (200): never pulls the whole file', async () => {
    const { f } = host(false)
    await expect(urlBytes(URL1, f).get(0, 8)).rejects.toThrow(/range not honoured/)
  })
  it('the same small range is fetched once', async () => {
    const { f, calls } = host()
    const b = urlBytes(URL1, f)
    await b.get(0, 127); await b.get(0, 127)
    expect(calls).toHaveLength(1)
  })
  it('a failed read is not remembered: the next try fetches again', async () => {
    let n = 0
    const { f: ok } = host()
    const f = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => (n++ === 0 ? new Response('', { status: 503 }) : ok(u, i))) as unknown as typeof fetch
    const b = urlBytes(URL1, f)
    await expect(b.get(0, 8)).rejects.toThrow()
    expect((await b.get(0, 8)).length).toBe(8)
  })
})

describe('hazardsOnline', () => {
  it('reads the same levels as the stored file would, using only ranges that are far smaller than the file', async () => {
    const { f, calls } = host()
    expect(await hazardsOnline(P, URL1, 'k1', undefined, f)).toEqual({ flood: 2, landslide: 0, surge: 0 })
    expect(calls.length).toBeGreaterThan(2)
    for (const c of calls) {
      const [a, b] = c.range!.replace('bytes=', '').split('-').map(Number) as [number, number]
      expect(b - a + 1).toBeLessThanOrEqual(file.length)
      expect(c.range).toMatch(/^bytes=\d+-\d+$/)
    }
  })
  it('a nearby point is decoded on its own and costs no extra network request (ranges are cached)', async () => {
    const { f, calls } = host()
    vi.stubGlobal('fetch', f) // the session range cache is kept for the real fetch only
    try {
      await hazardsOnline(P, URL1, 'k1')
      const n = calls.length
      const near = { lat: P.lat + 0.0001, lon: P.lon + 0.0001 } // about 15 m away
      expect(await hazardsOnline(near, URL1, 'k1')).toEqual({ flood: 2, landslide: 0, surge: 0 })
      expect(calls.length).toBe(n)
    } finally { vi.unstubAllGlobals() }
  })
  it('a short range body is refused', async () => {
    const f = vi.fn(async () => new Response(body(file.subarray(0, 4)), { status: 206 })) as unknown as typeof fetch
    await expect(urlBytes(URL1, f).get(0, 8)).rejects.toThrow(/short range/)
  })
  it('a metadata range that fails (503) rejects, never reads as empty layers; a healthy host works next', async () => {
    const { f: ok } = host()
    const h = parseHeader(file)
    const f = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => (new Headers(i?.headers).get('Range') === `bytes=${h.metaOffset}-${h.metaOffset + h.metaLength - 1}` ? new Response('', { status: 503 }) : ok(u, i))) as unknown as typeof fetch
    await expect(hazardsOnline(P, URL1, 'k1', undefined, f)).rejects.toThrow()
    expect(await hazardsOnline(P, URL1, 'k1', undefined, ok)).toEqual({ flood: 2, landslide: 0, surge: 0 })
  })
  it('a failed read throws (the caller shows "not checked") and caches nothing', async () => {
    const f = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    await expect(hazardsOnline(P, URL1, 'k1', undefined, f)).rejects.toThrow()
    const { f: ok } = host()
    expect(await hazardsOnline(P, URL1, 'k1', undefined, ok)).toEqual({ flood: 2, landslide: 0, surge: 0 })
  })
})
