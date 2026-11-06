// @vitest-environment node
// The fixture is an invented RSS document; expected values are hand-counted, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { BUDGET_MS, cleanTitle, FEEDS, GAP_MS, type ItemRow, KEEP_DAYS, parseRss, type Port, rowsFor, runNews, type WorldRow, xmlText } from './news.ts'

const xml = readFileSync(new URL('./fixtures/feed.xml', import.meta.url), 'utf8')
const NOW = Date.parse('2026-11-04T12:00:00Z')
const fresh = () => ({ world: new Set<string>(), items: new Set<string>() })

describe('parseRss', () => {
  const rows = parseRss(xml)!
  it('keeps items with a safe link and a date (guid is the link when there is none); drops bad scheme and no date', () => {
    expect(rows.map((r) => r.url)).toEqual(['https://news.example.test/a/1', 'https://news.example.test/a/2', 'https://news.example.test/a/3', 'https://news.example.test/a/4', 'https://news.example.test/a/7', 'https://news.example.test/a/8', 'https://news.example.test/a/1'])
  })
  it('strips CDATA, decodes entities once, keeps escaped markup as plain text', () => {
    expect(rows[0]!.title).toBe('Port closes ahead of storm & surge')
    expect(rows[1]!.title).toBe('Clinic hours – "extended" <b>today</b>')
    expect(rows[0]!.at).toBe('2026-11-04T01:30:00.000Z')
  })
  it('reads the picture from media:content, media:thumbnail or an image enclosure, never an audio enclosure', () => {
    expect(rows.map((r) => r.image)).toEqual(['https://img.example.test/a1.jpg', 'https://img.example.test/a2.png', 'https://img.example.test/a3.jpg', null, null, null, null])
  })
  it('reads the item source when the feed gives one', () => {
    expect(rows[1]!.source).toBe('Example Paper')
    expect(rows[0]!.source).toBe('')
  })
  it('an empty feed is a quiet day; anything that is not RSS is a failure', () => {
    expect(parseRss('<rss><channel><title>x</title></channel></rss>')).toEqual([])
    for (const bad of [null, 5, '', '<html>429 Too Many Requests</html>', 'rate limited']) expect(parseRss(bad)).toBeNull()
  })
})

describe('helpers', () => {
  it('xmlText decodes numeric references and leaves unknown ones', () => {
    expect(xmlText('a &#65;&#x42; &amp;amp; &bogus;')).toBe('a AB &amp; &bogus;')
  })
  it('cleanTitle collapses space, drops control characters and caps at 200', () => {
    expect(cleanTitle('a\u0000b\n\n  c')).toBe('a b c')
    expect(cleanTitle('x'.repeat(300)).length).toBe(200)
  })
})

describe('rowsFor', () => {
  const entries = parseRss(xml)!
  it('a world feed makes world rows named by source; the title-less, over-old and repeated links are dropped', async () => {
    const r = await rowsFor({ url: 'u', source: 'CNN', world: true }, entries, NOW, fresh())
    expect(r.items).toEqual([])
    expect(r.world.map((w) => w.url)).toEqual(['https://news.example.test/a/1', 'https://news.example.test/a/2', 'https://news.example.test/a/3', 'https://news.example.test/a/4'])
    expect(r.world.map((w) => w.source_domain)).toEqual(['CNN', 'Example Paper', 'CNN', 'CNN'])
    expect(r.world[0]).toMatchObject({ title: 'Port closes ahead of storm & surge', seen_at: '2026-11-04T01:30:00.000Z', lang: 'en', theme: 'world' })
    expect(r.world[0]!.id).toMatch(/^rss-[0-9a-f]{16}$/)
  })
  it('a topic feed makes news_items rows with topic and picture; the id depends only on the link', async () => {
    const a = await rowsFor({ url: 'u', source: 'Rappler', topic: 'national' }, entries, NOW, fresh())
    const b = await rowsFor({ url: 'u', source: 'CNN', world: true }, entries, NOW, fresh())
    expect(a.world).toEqual([])
    expect(a.items.map((i) => i.image_url)).toEqual(['https://img.example.test/a1.jpg', 'https://img.example.test/a2.png', 'https://img.example.test/a3.jpg', null])
    expect(a.items[0]).toMatchObject({ kind: 'article', topic: 'national', source: 'Rappler', published_at: '2026-11-04T01:30:00.000Z' })
    expect(a.items.map((i) => i.id)).toEqual(b.world.map((w) => w.id))
  })
  it('BBC images are dropped even when the feed has them', async () => {
    const r = await rowsFor({ url: 'u', source: 'BBC', world: true, topic: 'prepping', noImage: true }, entries, NOW, fresh())
    expect(r.items.length).toBe(4)
    expect(r.items.every((i) => i.image_url === null)).toBe(true)
    expect(FEEDS.find((f) => f.source === 'BBC')).toMatchObject({ noImage: true, world: true })
  })
  it('a link already seen (another feed) is not written twice in the same table', async () => {
    const seen = fresh()
    await rowsFor({ url: 'u', source: 'CNN', world: true }, entries, NOW, seen)
    expect((await rowsFor({ url: 'u', source: 'WHO', world: true, topic: 'health' }, entries, NOW, seen)).world).toEqual([])
  })
  it('a date over an hour ahead is a bad row', async () => {
    const r = await rowsFor({ url: 'u', source: 'X', world: true }, [{ title: 't', url: 'https://x.test/1', at: '2026-11-04T14:00:00.000Z', source: '', image: null }], NOW, fresh())
    expect(r.world).toEqual([])
  })
})

describe('topic mapping', () => {
  it('maps each Discover feed to the topic the brief names, and only WHO/CNN/BBC feed World', () => {
    const t = (src: string, hint?: string) => FEEDS.filter((f) => f.source === src && (!hint || f.url.includes(hint))).map((f) => f.topic)
    expect(t('WHO')).toEqual(['health'])
    expect(t('GDACS')).toEqual(['prepping'])
    expect(t('Google News', 'typhoon')).toEqual(['prepping'])
    expect(t('Google News', 'DOH')).toEqual(['health'])
    expect(t('Google News', 'mental')).toEqual(['wellbeing'])
    expect([...t('Inquirer'), ...t('Rappler'), ...t('GMA News')]).toEqual(['national', 'national', 'national'])
    expect(FEEDS.filter((f) => f.world).map((f) => f.source)).toEqual(['WHO', 'CNN', 'BBC'])
    expect(FEEDS.length).toBe(10)
  })
})

const port = () => {
  const world: WorldRow[][] = [], items: ItemRow[][] = [], purged: string[] = []
  const p: Port = { upsertWorld: vi.fn(async (r) => { world.push(r) }), upsertItems: vi.fn(async (r) => { items.push(r) }), purge: vi.fn(async (b) => { purged.push(b) }) }
  return { p, world, items, purged }
}

describe('runNews', () => {
  it('reads every feed with a gap, writes merged rows once per table, purges at 7 days', async () => {
    const { p, world, items, purged } = port()
    const sleep = vi.fn(async () => {})
    const res = await runNews(p, async () => xml, NOW, sleep)
    expect(res).toMatchObject({ ok: true, queries_ok: 10, queries_failed: 0 })
    expect(res.rows).toBe(4) // the 4 distinct links, first world feed (WHO) wins
    expect(res.items).toBe(4) // topic feeds repeat the same links: first topic wins
    expect(sleep.mock.calls.length).toBe(9)
    expect(sleep.mock.calls[0]).toEqual([GAP_MS])
    expect(world.length).toBe(1)
    expect(items.length).toBe(1)
    expect(KEEP_DAYS).toBe(7)
    expect(purged).toEqual(['2026-10-28T12:00:00.000Z'])
  })
  it('one failed feed does not stop the others', async () => {
    const { p } = port()
    let n = 0
    const res = await runNews(p, async () => { if (++n === 2) throw new Error('HTTP429'); return xml }, NOW, async () => {})
    expect(res).toMatchObject({ ok: true, queries_ok: 9, queries_failed: 1 })
  })
  it('every feed failing writes and purges nothing and reports not ok', async () => {
    const { p, purged } = port()
    const res = await runNews(p, async () => '<html>blocked</html>', NOW, async () => {})
    expect(res).toEqual({ ok: false, rows: 0, items: 0, queries_ok: 0, queries_failed: 10 })
    expect(p.upsertWorld).not.toHaveBeenCalled()
    expect(p.upsertItems).not.toHaveBeenCalled()
    expect(purged).toEqual([])
  })
  it('a quiet day (no items) still counts as ok and purges old rows', async () => {
    const { p, purged } = port()
    const res = await runNews(p, async () => '<rss><channel></channel></rss>', NOW, async () => {})
    expect(res.ok).toBe(true)
    expect(p.upsertWorld).not.toHaveBeenCalled()
    expect(purged.length).toBe(1)
  })
  it('stops starting feeds once the time budget is spent', async () => {
    const { p } = port()
    let t = 0
    const clock = () => t
    const fetchText = vi.fn(async () => { t += BUDGET_MS / 2 + 1; return xml })
    const res = await runNews(p, fetchText, NOW, async () => {}, clock)
    expect(fetchText).toHaveBeenCalledTimes(2) // clock reads 0, 55001, 110002: the third start is over budget
    expect(res).toMatchObject({ queries_ok: 2, queries_failed: 8 })
  })
})

describe('index.ts wiring (source guard: the function itself needs Deno)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the secret before any work, sends the agreed User-Agent, never chains .catch on a supabase builder', () => {
    expect(src.indexOf("Deno.env.get('WORLD_NEWS_CRON_SECRET')")).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain('x-world-news-secret')
    expect(src).toContain('secret.length < 32')
    expect(src).toContain("'User-Agent': 'FamilyBantay/1.0'")
    expect(src).not.toMatch(/sb\.[\s\S]{0,80}\.catch\(/)
    expect(src).toContain("heartbeat(sb, 'world-news'")
  })
})
