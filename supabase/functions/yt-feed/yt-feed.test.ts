// @vitest-environment node
// The fixture is the real GMA News channel feed captured 2026-11-08, trimmed to its first 3 entries (public video titles, no personal data). Expected values are hand-read from it, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { CHANNELS, FEED_URL, parseFeed, parsePlaylist, pickFresh, runFeeds, uploadsPlaylist, type NewsRow } from './feed.ts'

const xml = readFileSync(new URL('./fixtures/gma.xml', import.meta.url), 'utf8')
const GMA = CHANNELS[0]!
const NOW = Date.parse('2026-11-08T11:00:00Z')

describe('parseFeed', () => {
  const rows = parseFeed(xml, GMA, NOW)!
  it('reads the three entries: id, channel, title, date', () => {
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ video_id: 'hGbCo2t8WGg', channel_id: 'UCqYw-CTd1dU2yGI71sEyqNw', channel: 'GMA News', title: 'RECAP - Romualdez cannot have personal staff with him in jail, says Ombudsman Remulla | GMA News', published_at: '2026-11-08T10:00:07.000Z' })
    expect(rows[1]!.title).toBe('24 Oras Weekend Livestream: November 8, 2026')
    expect(rows[2]!.published_at).toBe('2026-11-08T09:00:08.000Z')
  })
  it('null for a block page or non-text; empty for a feed with no usable entry', () => {
    for (const bad of [null, 5, '', '<html>429</html>']) expect(parseFeed(bad, GMA, NOW)).toBeNull()
    expect(parseFeed('<feed></feed>', GMA, NOW)).toEqual([])
  })
  it('skips an entry of another channel, a bad id, an empty title, a bad date and a date in the future; decodes entities', () => {
    const e = (id: string, ch: string, t: string, d: string) => `<entry><yt:videoId>${id}</yt:videoId><yt:channelId>${ch}</yt:channelId><title>${t}</title><published>${d}</published></entry>`
    const feed = `<feed>${e('aaaaaaaaaaa', GMA.id, 'Tom &amp; Jerry &#39;s &quot;x&quot;', '2026-11-08T10:00:00+00:00')}${e('bbbbbbbbbbb', CHANNELS[1]!.id, 'other', '2026-11-08T10:00:00+00:00')}${e('short', GMA.id, 'bad id', '2026-11-08T10:00:00+00:00')}${e('ccccccccccc', GMA.id, '', '2026-11-08T10:00:00+00:00')}${e('ddddddddddd', GMA.id, 'no date', 'soon')}${e('eeeeeeeeeee', GMA.id, 'future', '2026-11-09T10:00:00+00:00')}</feed>`
    const got = parseFeed(feed, GMA, NOW)!
    expect(got.map((r) => r.video_id)).toEqual(['aaaaaaaaaaa'])
    expect(got[0]!.title).toBe(`Tom & Jerry 's "x"`)
  })
})

describe('pickFresh', () => {
  const row = (id: string, ch: number, title: string, hoursAgo: number): NewsRow => ({ video_id: id.padEnd(11, 'x'), channel_id: CHANNELS[ch]!.id, channel: CHANNELS[ch]!.label, title, published_at: new Date(NOW - hoursAgo * 3_600_000).toISOString() })
  it('keeps 3 days, drops a finished livestream (older than 12 h) but keeps a fresh one, newest first, no repeats', () => {
    const got = pickFresh([row('old', 0, 'News', 73), row('edge', 0, 'News', 71), row('live-old', 0, 'LIVE: Mass', 13), row('live-new', 1, 'LIVE: Mass', 11), row('new', 2, 'News', 1), row('new', 2, 'News', 1)], NOW)
    expect(got.map((r) => r.video_id.replace(/x+$/, ''))).toEqual(['new', 'live-new', 'edge'])
  })
  it('keeps at most 15 per channel', () => {
    const many = Array.from({ length: 20 }, (_, i) => row('v' + String(i).padStart(2, '0'), 0, 'News', i + 1))
    expect(pickFresh(many, NOW)).toHaveLength(15)
  })
})

describe('parsePlaylist', () => {
  it('reads playlistItems; null when it is not that answer', () => {
    const json = { items: [{ snippet: { title: 'A &amp; B', channelId: GMA.id, resourceId: { videoId: 'fffffffffff' } }, contentDetails: { videoPublishedAt: '2026-11-08T08:00:00Z' } }, { snippet: { title: 'no date', resourceId: { videoId: 'ggggggggggg' } } }] }
    expect(parsePlaylist(json, GMA, NOW)).toEqual([{ video_id: 'fffffffffff', channel_id: GMA.id, channel: 'GMA News', title: 'A & B', published_at: '2026-11-08T08:00:00.000Z' }])
    expect(parsePlaylist({ error: {} }, GMA, NOW)).toBeNull()
    expect(uploadsPlaylist(GMA.id)).toBe('UUqYw-CTd1dU2yGI71sEyqNw')
  })
})

describe('runFeeds', () => {
  const port = () => ({ upsert: vi.fn(async (_r: { fetched_at: string }[]) => undefined), purge: vi.fn(async (_d: string) => undefined) })
  it('upserts from the feeds that answered, trims by the 3-day cutoff, never calls the API', async () => {
    const p = port()
    const fetchText = vi.fn(async (u: string) => { if (u === FEED_URL + GMA.id) return xml; throw new Error('HTTP500') })
    expect(await runFeeds(p, fetchText, NOW, 'KEY')).toEqual({ ok: true, rows: 3, source: 'rss' }) // the fixture's three entries are 1 to 2.5 h old; the livestream is under 12 h, so it stays
    expect(fetchText.mock.calls.every((c) => !c[0].includes('googleapis'))).toBe(true)
    expect(p.purge).toHaveBeenCalledWith('2026-11-05T11:00:00.000Z')
    expect(p.upsert.mock.calls[0]![0].every((r) => r.fetched_at === '2026-11-08T11:00:00.000Z')).toBe(true)
  })
  it('every feed fails: the key reads the uploads playlists; without a key nothing is written or trimmed', async () => {
    const p = port()
    const api = JSON.stringify({ items: [{ snippet: { title: 'T', channelId: GMA.id, resourceId: { videoId: 'hhhhhhhhhhh' } }, contentDetails: { videoPublishedAt: '2026-11-08T08:00:00Z' } }] })
    const fetchText = vi.fn(async (u: string) => { if (u.startsWith(FEED_URL)) throw new Error('HTTP404'); return api })
    const r = await runFeeds(p, fetchText, NOW, 'KEY')
    expect(r.source).toBe('api')
    expect(r.ok).toBe(true)
    const q = port()
    expect(await runFeeds(q, fetchText, NOW)).toEqual({ ok: false, rows: 0, source: 'none' })
    expect(q.upsert).not.toHaveBeenCalled()
    expect(q.purge).not.toHaveBeenCalled()
  })
})

describe('index.ts wiring (source guard; the function itself passed deno check)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the secret header before any work, upserts on video_id, and never chains .catch on a builder', () => {
    expect(src.indexOf("req.headers.get('x-yt-secret')")).toBeGreaterThan(-1)
    expect(src.indexOf("req.headers.get('x-yt-secret')")).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain("onConflict: 'video_id'")
    expect(src).toContain('YT_FEED_CRON_SECRET')
    expect(src).not.toMatch(/\.(catch|finally)\(/)
  })
})
