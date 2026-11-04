// @vitest-environment node
// The fixture's first article is a real GDELT DOC 2.0 ArtList answer (fetched read-only 2026-11-05); the rest were added by hand to cover the filters.
// Expected values are hand-counted, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { cleanTitle, GAP_MS, gdeltUrl, KEEP_DAYS, type NewsRow, parseGdelt, type Port, QUERIES, runNews, seenIso } from './news.ts'

const fx = JSON.parse(readFileSync(new URL('./fixtures/gdelt.json', import.meta.url), 'utf8'))
const NOW = Date.parse('2026-11-04T12:00:00Z')

describe('parseGdelt', () => {
  it('keeps the real article and the cleaned one; drops bad scheme, no title, no date, future date and the repeated link', async () => {
    const rows = (await parseGdelt(fx, 'prices', NOW))!
    expect(rows.map((r) => r.url)).toEqual([fx.articles[0].url, 'https://news.example/a/1'])
    expect(rows[0]).toMatchObject({ title: 'Iranian island in Hormuz strait attacked media', source_domain: 'manilatimes.net', seen_at: '2026-11-04T01:30:00.000Z', lang: 'english', theme: 'prices' })
    expect(rows[1]!.title).toBe('Example fuel price outlook')
    expect(rows[0]!.id).toMatch(/^gdelt-[0-9a-f]{16}$/)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })
  it('the id depends only on the link, so a rerun upserts the same row', async () => {
    const a = (await parseGdelt(fx, 'prices', NOW))!
    const b = (await parseGdelt(fx, 'world', NOW))!
    expect(b.map((r) => r.id)).toEqual(a.map((r) => r.id))
  })
  it('an empty answer is a quiet day; anything that is not an article list is a failure', async () => {
    expect(await parseGdelt({}, 'prices', NOW)).toEqual([])
    expect(await parseGdelt({ articles: [] }, 'prices', NOW)).toEqual([])
    for (const bad of [null, 'rate limited', 5, [], { articles: 'x' }]) expect(await parseGdelt(bad, 'prices', NOW)).toBeNull()
  })
  it('stores markup as text, untouched', async () => {
    const r = (await parseGdelt({ articles: [{ url: 'https://x.example/1', title: '<script>alert(1)</script> Hi', seendate: '20261104T010000Z' }] }, 't', NOW))!
    expect(r[0]!.title).toBe('<script>alert(1)</script> Hi')
  })
})

describe('helpers', () => {
  it('seenIso reads the GDELT stamp only', () => {
    expect(seenIso('20261104T013000Z')).toBe('2026-11-04T01:30:00.000Z')
    for (const bad of ['2026-11-04', '20261104', 7, undefined, '20261304T013000Z']) expect(seenIso(bad)).toBeNull()
  })
  it('cleanTitle collapses space, drops control characters and caps at 200', () => {
    expect(cleanTitle('a\u0000b\n\n  c')).toBe('a b c')
    expect(cleanTitle('x'.repeat(300)).length).toBe(200)
  })
  it('builds a read-only article-list url', () => {
    const u = new URL(gdeltUrl(QUERIES[0]!.q))
    expect(u.origin + u.pathname).toBe('https://api.gdeltproject.org/api/v2/doc/doc')
    expect(u.searchParams.get('mode')).toBe('ArtList')
    expect(u.searchParams.get('format')).toBe('json')
    expect(u.searchParams.get('query')).toBe(QUERIES[0]!.q)
  })
})

const port = () => {
  const rows: NewsRow[][] = []
  const purged: string[] = []
  const p: Port = { upsert: vi.fn(async (r) => { rows.push(r) }), purge: vi.fn(async (b) => { purged.push(b) }) }
  return { p, rows, purged }
}

describe('runNews', () => {
  it('reads three queries 5.5 s apart, writes the merged rows once, purges at 7 days', async () => {
    const { p, rows, purged } = port()
    const sleep = vi.fn(async () => {})
    const res = await runNews(p, async () => fx, NOW, sleep)
    expect(res).toEqual({ ok: true, rows: 2, queries_ok: 3, queries_failed: 0 })
    expect(sleep.mock.calls).toEqual([[GAP_MS], [GAP_MS]])
    expect(rows.length).toBe(1)
    expect(rows[0]!.every((r) => r.theme === 'prices')).toBe(true) // the first query to see a link names its theme
    expect(KEEP_DAYS).toBe(7)
    expect(purged).toEqual(['2026-10-28T12:00:00.000Z'])
  })
  it('one failed query does not stop the others', async () => {
    const { p } = port()
    let n = 0
    const res = await runNews(p, async () => { if (++n === 2) throw new Error('HTTP429'); return fx }, NOW, async () => {})
    expect(res).toMatchObject({ ok: true, queries_ok: 2, queries_failed: 1 })
  })
  it('every query failing writes and purges nothing and reports not ok', async () => {
    const { p, purged } = port()
    const res = await runNews(p, async () => 'rate limited', NOW, async () => {})
    expect(res).toEqual({ ok: false, rows: 0, queries_ok: 0, queries_failed: 3 })
    expect(p.upsert).not.toHaveBeenCalled()
    expect(purged).toEqual([])
  })
  it('a quiet day (no articles) still counts as ok and purges old rows', async () => {
    const { p, purged } = port()
    const res = await runNews(p, async () => ({}), NOW, async () => {})
    expect(res.ok).toBe(true)
    expect(p.upsert).not.toHaveBeenCalled()
    expect(purged.length).toBe(1)
  })
})

describe('index.ts wiring (source guard: the function itself needs Deno)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the secret before any work and never chains .catch on a supabase builder', () => {
    expect(src.indexOf("Deno.env.get('WORLD_NEWS_CRON_SECRET')")).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain('x-world-news-secret')
    expect(src).toContain('secret.length < 32')
    expect(src).not.toMatch(/sb\.[\s\S]{0,80}\.catch\(/)
    expect(src).toContain("heartbeat(sb, 'world-news'")
  })
})
