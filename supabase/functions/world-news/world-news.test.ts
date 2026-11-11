// @vitest-environment node
// The fixture is an invented RSS document; expected values are hand-counted, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { BUDGET_MS, cleanTitle, FEEDS, GAP_MS, type ItemRow, KEEP_DAYS, parseRss, type Port, rowsFor, runNews, type WorldRow, xmlText } from './news.ts'

// the fixture titles are not about the Philippines: world rows need that, so most tests read a copy whose titles are (empty titles stay empty)
const plain = readFileSync(new URL('./fixtures/feed.xml', import.meta.url), 'utf8')
const xml = plain.replace(/<title>(?!<\/title>)/g, '<title>Philippines: ')
const NOW = Date.parse('2026-11-04T12:00:00Z')
const fresh = () => ({ world: new Set<string>(), items: new Set<string>() })

describe('parseRss', () => {
  const rows = parseRss(plain)!
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
  const e0 = (o: object) => ({ title: 't', url: 'https://x.test/1', at: '2026-11-04T10:00:00.000Z', source: '', image: null, ...o })
  it('a world feed makes world rows named by source; the title-less, over-old and repeated links are dropped', async () => {
    const r = await rowsFor({ url: 'u', source: 'CNN', world: true }, entries, NOW, fresh())
    expect(r.items).toEqual([])
    expect(r.world.map((w) => w.url)).toEqual(['https://news.example.test/a/1', 'https://news.example.test/a/2', 'https://news.example.test/a/3', 'https://news.example.test/a/4'])
    expect(r.world.map((w) => w.source_domain)).toEqual(['CNN', 'Example Paper', 'CNN', 'CNN'])
    expect(r.world[0]).toMatchObject({ title: 'Philippines: Port closes ahead of storm & surge', seen_at: '2026-11-04T01:30:00.000Z', lang: 'en', theme: 'world' })
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

describe('relevance at ingest (rules.ts)', () => {
  const at = '2026-11-04T10:00:00.000Z'
  const e = (title: string, extra: object = {}) => ({ title, url: `https://x.test/${encodeURIComponent(title)}`, at, source: '', image: null, ...extra })
  it('world rows keep PH-impact headlines and drop the rest; the 15 cap counts what is kept', async () => {
    const r = await rowsFor({ url: 'u', source: 'BBC', world: true }, [e('Typhoon Rosal enters PAR'), e('Oil prices jump as Iran tensions rise'), e('Green forest fire notification in Nigeria'), e('Celebrity lawsuit enters second week')], NOW, fresh())
    expect(r.world.map((w) => w.title)).toEqual(['Typhoon Rosal enters PAR', 'Oil prices jump as Iran tensions rise'])
    const many = Array.from({ length: 30 }, (_, i) => e(i % 2 ? `Peso update ${i}` : `Weather in Kenya ${i}`))
    expect((await rowsFor({ url: 'u', source: 'BBC', world: true }, many, NOW, fresh())).world.length).toBe(15)
  })
  it('a world item dropped as irrelevant does not mark its link seen for a later feed', async () => {
    const seen = fresh()
    await rowsFor({ url: 'u', source: 'A', world: true }, [e('Wildfire in Chad', { url: 'https://x.test/z' })], NOW, seen)
    expect(seen.world.size).toBe(0)
  })
  it('GDACS items are kept only in or near the Philippines', async () => {
    const gd = { url: 'u', source: 'GDACS', topic: 'prepping' as const, geo: true }
    const r = await rowsFor(gd, [e('Green earthquake in Luzon', { lat: 16, lon: 120.5 }), e('Green forest fire notification in Nigeria', { lat: 9, lon: 8 }), e('Green forest fire notification in Australia', { country: 'Australia' }), e('Orange tropical cyclone ROSAL', { country: 'Philippines' })], NOW, fresh())
    expect(r.items.map((i) => i.title)).toEqual(['Green earthquake in Luzon', 'Orange tropical cyclone ROSAL'])
  })
  it('parseRss reads GDACS position and country', () => {
    const doc = '<rss><channel><item><title>Green forest fire in Nigeria</title><link>https://x.test/g1</link><pubDate>Wed, 04 Nov 2026 01:30:00 GMT</pubDate><geo:Point><geo:lat>9.5</geo:lat><geo:long>8.25</geo:long></geo:Point><gdacs:country>Nigeria</gdacs:country></item><item><title>No point</title><link>https://x.test/g2</link><pubDate>Wed, 04 Nov 2026 01:30:00 GMT</pubDate><georss:point>12.5 -140.5</georss:point></item></channel></rss>'
    const [a, b] = parseRss(doc)!
    expect(a).toMatchObject({ lat: 9.5, lon: 8.25, country: 'Nigeria' })
    expect(b).toMatchObject({ lat: 12.5, lon: -140.5 })
  })
  it('health and wellbeing feeds drop showbiz and crime clickbait; national stays national', async () => {
    const list = [e('Celebrity couple reveals fitness secret'), e('Actor dies at 45'), e('Five habits for better sleep')]
    expect((await rowsFor({ url: 'u', source: 'GMA', topic: 'wellbeing' }, list, NOW, fresh())).items.map((i) => i.title)).toEqual(['Five habits for better sleep'])
    expect((await rowsFor({ url: 'u', source: 'GMA', topic: 'national' }, list, NOW, fresh())).items.length).toBe(3)
  })
  it('a wellbeing feed keeps only wellbeing stories: an entertainment headline from a lifestyle section is dropped', async () => {
    const r = await rowsFor({ url: 'u', source: 'GMA', topic: 'wellbeing' }, [e('Katseye in Manila and Cebu: Ticket prices announced'), e('Healthy lifestyle key to aging well, experts say'), e('Refill stores in Metro Manila')], NOW, fresh())
    expect(r.items.map((i) => i.title)).toEqual(['Healthy lifestyle key to aging well, experts say'])
  })
  it('a Google News title loses its " - Outlet" tail and the outlet becomes the source', async () => {
    const r = await rowsFor({ url: 'u', source: 'Google News PH', world: true }, [e('Oil prices jump as Iran tensions rise - Example Times', { source: 'Example Times' })], NOW, fresh())
    expect(r.world[0]).toMatchObject({ title: 'Oil prices jump as Iran tensions rise', source_domain: 'Example Times' })
  })
})

describe('zone tag (S30 C5)', () => {
  it('a Texas feed writes zone texas on its items, no image, and every other feed writes no zone key at all', async () => {
    const list = [{ title: 'Houston council passes budget', url: 'https://news.example.test/tx/1', at: '2026-11-04T10:00:00.000Z', source: '', image: 'https://img.example.test/x.jpg' }]
    const tx = await rowsFor({ url: 'u', source: 'Houston Public Media', topic: 'national', zone: 'texas', noImage: true }, list, NOW, fresh())
    expect(tx.items).toHaveLength(1)
    expect(tx.items[0]).toMatchObject({ zone: 'texas', topic: 'national', source: 'Houston Public Media', image_url: null })
    const ph = await rowsFor({ url: 'u', source: 'GMA News', topic: 'national' }, list, NOW, fresh())
    expect(Object.keys(ph.items[0]!)).not.toContain('zone')
  })
})

describe('topic mapping', () => {
  it('maps each Discover feed to the topic the brief names, and only WHO, BBC and Google News PH feed World', () => {
    const topics = (t: string) => FEEDS.filter((f) => f.topic === t).map((f) => f.source)
    expect(topics('health')).toEqual(['WHO', 'Inquirer', 'GMA News'])
    expect(topics('wellbeing')).toEqual(['Inquirer', 'GMA News'])
    expect(topics('prepping')).toEqual(['GDACS', 'Inquirer', 'Rappler'])
    expect(topics('national')).toEqual(['Inquirer', 'Rappler', 'GMA News', 'Philstar', 'Houston Public Media', 'NPR'])
    expect(FEEDS.filter((f) => f.zone).map((f) => [f.source, f.zone])).toEqual([['Houston Public Media', 'texas'], ['NPR', 'texas']]) // every other feed is for everyone (zone unset)
    expect(FEEDS.filter((f) => f.world).map((f) => f.source)).toEqual(['WHO', 'BBC', 'Google News PH'])
    expect(FEEDS.filter((f) => f.geo).map((f) => f.source)).toEqual(['GDACS'])
  })
  it('feed list sanity: at most 16, all https, unique, one Google News PH feed, no CNN', () => {
    expect(FEEDS.length).toBeLessThanOrEqual(16)
    const urls = FEEDS.map((f) => f.url)
    expect(urls.every((u) => u.startsWith('https://'))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.filter((u) => /news\.google\.com\/rss\/search\?.*gl=PH/.test(u)).length).toBe(1)
    expect(urls.some((u) => /cnn\.com/.test(u) || (/google/.test(u) && !/gl=PH/.test(u)))).toBe(false)
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
    expect(res).toMatchObject({ ok: true, queries_ok: 16, queries_failed: 0 })
    expect(res.rows).toBe(4) // the 4 distinct links, first world feed (WHO) wins
    expect(res.items).toBe(4) // topic feeds repeat the same links: first topic wins
    expect(sleep.mock.calls.length).toBe(15)
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
    expect(res).toMatchObject({ ok: true, queries_ok: 15, queries_failed: 1 })
  })
  it('every feed failing writes and purges nothing and reports not ok', async () => {
    const { p, purged } = port()
    const res = await runNews(p, async () => '<html>blocked</html>', NOW, async () => {})
    expect(res).toEqual({ ok: false, rows: 0, items: 0, queries_ok: 0, queries_failed: 16 })
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
    expect(res).toMatchObject({ queries_ok: 2, queries_failed: 14 })
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
