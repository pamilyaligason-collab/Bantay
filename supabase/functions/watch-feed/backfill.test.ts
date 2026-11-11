// @vitest-environment node
// S34 back catalogue. The API pages are built here in the playlistItems shape (invented ids and titles; no real key, no network). Expected values are hand-counted.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { API_URL, uploadsPlaylist } from '../yt-feed/feed.ts'
import { BACKFILL_PAGES, BUDGET_MS, type BackfillPort, EVERGREEN_PER_CHANNEL, EVERGREEN_PER_SHELF, pickEvergreen, runBackfill } from './backfill.ts'
import { CHANNELS, type Shelf, type WatchRow } from './feed.ts'

const NOW = Date.parse('2026-11-11T10:00:00Z')
const DAY = 86_400_000
const KEY = 'AIza-test-key-not-real'
const WORD: Record<Shelf, string> = { prepping: 'Typhoon safety', 'farm-diy': 'Farm tips', recipes: 'Easy recipe' }
let n = 0
const vid = () => 'vid' + String(++n).padStart(8, '0')
const item = (channelId: string, id: string, title: string, daysAgo: number) => ({ snippet: { title, resourceId: { videoId: id }, videoOwnerChannelId: channelId }, contentDetails: { videoPublishedAt: new Date(NOW - daysAgo * DAY).toISOString() } })
const page = (items: unknown[], next?: string) => ({ items, ...(next ? { nextPageToken: next } : {}) })
const row = (shelf: Shelf, ch: string, title: string, daysAgo: number, id = vid()): WatchRow => ({ video_id: id, shelf, channel_id: ch, channel: ch, title, published_at: new Date(NOW - daysAgo * DAY).toISOString() })
const chan = (label: string) => CHANNELS.find((c) => c.label === label)!
const PRC = chan('Philippine Red Cross')
const PANLASANG = chan('Panlasang Pinoy')

const port = (existing: WatchRow[] = []) => ({
  listEvergreen: vi.fn(async () => existing),
  upsert: vi.fn(async (_r: (WatchRow & { fetched_at: string; evergreen: true })[]) => undefined),
  remove: vi.fn(async (_ids: string[]) => undefined)
}) satisfies BackfillPort
const idOf = (url: string) => CHANNELS.find((c) => url.includes('playlistId=' + uploadsPlaylist(c.id) + '&'))!
const tokenOf = (url: string) => new URL(url).searchParams.get('pageToken') ?? ''
/** Every channel answers `pages` pages of `per` old videos each (titles by shelf). */
const apiOf = (pages: number, per: number, firstDaysAgo = 40) => async (url: string) => {
  const c = idOf(url)
  const p = Number(tokenOf(url).replace('t', '') || 0)
  return page(Array.from({ length: per }, (_, i) => item(c.id, vid(), `${WORD[c.shelf]} ${p}-${i}`, firstDaysAgo + p * per + i)), p + 1 < pages ? 't' + (p + 1) : undefined)
}

describe('pickEvergreen', () => {
  it('only older than 30 days (30 exactly is still New, 31 is evergreen); a video 5 years old is kept; Shorts, livestreams, off-shelf titles and repeats are dropped; newest first', () => {
    const got = pickEvergreen([row('recipes', 'A', 'Easy recipe fresh', 10), row('recipes', 'A', 'Easy recipe edge', 30), row('recipes', 'A', 'Easy recipe 31', 31), row('recipes', 'A', 'Easy recipe ancient', 1800), row('recipes', 'A', 'Easy recipe #shorts', 90),
      row('recipes', 'A', 'Recipe LIVE: cooking', 90), row('recipes', 'A', 'My birthday vlog', 90), row('recipes', 'A', 'Easy recipe 31', 31, 'same0000001'), row('recipes', 'A', 'Easy recipe 31', 31, 'same0000001')], NOW)
    expect(got.map((r) => r.title)).toEqual(['Easy recipe 31', 'Easy recipe 31', 'Easy recipe ancient'])
    expect(new Set(got.map((r) => r.video_id)).size).toBe(3)
  })
  it('10 per channel and 30 per shelf, newest first; another shelf is not affected', () => {
    const rows = [...Array.from({ length: 15 }, (_, i) => row('prepping', 'A', 'Typhoon safety A' + i, 40 + i)), ...Array.from({ length: 12 }, (_, i) => row('prepping', 'B', 'Typhoon safety B' + i, 40.5 + i)),
      ...Array.from({ length: 12 }, (_, i) => row('prepping', 'C', 'Typhoon safety C' + i, 41 + i)), row('recipes', 'R', 'Easy recipe R', 500)]
    const got = pickEvergreen(rows, NOW)
    const prep = got.filter((r) => r.shelf === 'prepping')
    expect(EVERGREEN_PER_CHANNEL).toBe(10)
    expect(EVERGREEN_PER_SHELF).toBe(30)
    expect(prep).toHaveLength(30) // 3 channels x 10
    for (const ch of ['A', 'B', 'C']) expect(prep.filter((r) => r.channel_id === ch)).toHaveLength(10)
    expect(got.filter((r) => r.shelf === 'recipes')).toHaveLength(1)
    // 4 channels would offer 40: the 10 oldest lose
    const four = ['A', 'B', 'C', 'D'].flatMap((ch, c) => Array.from({ length: 10 }, (_, i) => row('prepping', ch, 'Typhoon safety ' + ch + i, 40 + c * 0.1 + i)))
    const capped = pickEvergreen(four, NOW)
    expect(capped).toHaveLength(30)
    const oldestKept = Math.min(...capped.map((x) => Date.parse(x.published_at)))
    expect(four.filter((r) => !capped.includes(r)).every((r) => Date.parse(r.published_at) <= oldestKept)).toBe(true)
  })
})

describe('runBackfill', () => {
  it('pages each channel through its uploads playlist: 50 per page, the page token followed, never more than 4 pages (a 5th is never asked for)', async () => {
    const urls: string[] = []
    const api = apiOf(99, 50) // every page says there is another
    const p = port()
    const r = await runBackfill(p, async (u) => { urls.push(u); return api(u) }, async () => true, NOW, KEY)
    expect(BACKFILL_PAGES).toBe(4)
    expect(urls).toHaveLength(7 * 4)
    for (const c of CHANNELS) {
      const mine = urls.filter((u) => u.includes('playlistId=' + uploadsPlaylist(c.id) + '&'))
      expect(mine.map(tokenOf)).toEqual(['', 't1', 't2', 't3'])
    }
    expect(urls.every((u) => u.startsWith(API_URL + '?') && u.includes('maxResults=50'))).toBe(true)
    expect(r).toMatchObject({ ok: true, rows: 7 * 200, pages: 28, channels_ok: 7, channels_failed: 0 })
  })
  it('a channel whose first page has no next token is read once', async () => {
    const urls: string[] = []
    await runBackfill(port(), async (u) => { urls.push(u); return apiOf(1, 3)(u) }, async () => true, NOW, KEY)
    expect(urls).toHaveLength(7)
  })
  it('keeps old videos of any age, at most 10 per channel and 30 per shelf: 7 channels x 15 old videos give 30 prepping + 20 farm + 20 recipes = 70, all upserted as evergreen with the run time', async () => {
    const p = port()
    const r = await runBackfill(p, apiOf(1, 15, 100), async () => true, NOW, KEY)
    expect(r).toMatchObject({ ok: true, rows: 105, added: 70, removed: 0, kept: 70, checked: 70, skipped: 0 })
    const up = p.upsert.mock.calls[0]![0]
    expect(up).toHaveLength(70)
    expect(up.every((x) => x.evergreen === true && x.fetched_at === '2026-11-11T10:00:00.000Z')).toBe(true)
    const by = (s: Shelf) => up.filter((x) => x.shelf === s).length
    expect([by('prepping'), by('farm-diy'), by('recipes')]).toEqual([30, 20, 20])
    expect(p.remove).not.toHaveBeenCalled()
  })
  it('never flips a fresh row: videos from the last 30 days are not written, an old one beside them is', async () => {
    const p = port()
    const api = async (u: string) => { const c = idOf(u); return page([item(c.id, 'fresh000001', 'Easy recipe fresh', 3), item(c.id, 'fresh000002', 'Easy recipe edge', 30), item(c.id, 'old00000001', 'Easy recipe old', 31)]) }
    const r = await runBackfill(p, api, async () => true, NOW, KEY)
    expect(r.ok).toBe(true)
    const ids = p.upsert.mock.calls[0]![0].map((x) => x.video_id)
    expect(ids).not.toContain('fresh000001')
    expect(ids).not.toContain('fresh000002')
    expect(ids).toContain('old00000001')
  })
  it('a video the play check refuses is not added', async () => {
    const p = port()
    const api = async (u: string) => { const c = idOf(u); return c.id === PANLASANG.id ? page([item(c.id, 'dead0000001', 'Easy recipe dead', 60), item(c.id, 'live0000001', 'Easy recipe fine', 61)]) : page([]) }
    const r = await runBackfill(p, api, async (id) => id !== 'dead0000001', NOW, KEY)
    expect(r).toMatchObject({ ok: true, added: 1, kept: 1 })
    expect(p.upsert.mock.calls[0]![0].map((x) => x.video_id)).toEqual(['live0000001'])
  })
  it('re-checks the evergreen rows already stored: one that no longer plays is deleted, one that plays stays untouched, nothing re-added', async () => {
    const keep = row('recipes', PANLASANG.id, 'Easy recipe stays', 200, 'keep0000001')
    const gone = row('prepping', PRC.id, 'Typhoon safety gone', 300, 'gone0000001')
    const p = port([keep, gone])
    const asked: string[] = []
    const r = await runBackfill(p, async () => page([]), async (id) => { asked.push(id); return id !== 'gone0000001' }, NOW, KEY)
    expect(r).toMatchObject({ ok: true, added: 0, removed: 1, kept: 1, checked: 2 })
    expect(p.remove).toHaveBeenCalledWith(['gone0000001'])
    expect(p.upsert).not.toHaveBeenCalled()
    expect(asked.sort()).toEqual(['gone0000001', 'keep0000001'])
  })
  it('a video already stored is checked once, not again as a candidate', async () => {
    const have = row('recipes', PANLASANG.id, 'Easy recipe have', 200, 'have0000001')
    const asked: string[] = []
    const api = async (u: string) => (idOf(u).id === PANLASANG.id ? page([item(PANLASANG.id, 'have0000001', 'Easy recipe have', 200), item(PANLASANG.id, 'newr0000001', 'Easy recipe new', 100)]) : page([]))
    const p = port([have])
    const r = await runBackfill(p, api, async (id) => { asked.push(id); return true }, NOW, KEY)
    expect(asked.sort()).toEqual(['have0000001', 'newr0000001'])
    expect(r).toMatchObject({ added: 1, removed: 0, kept: 2 })
    expect(p.upsert.mock.calls[0]![0].map((x) => x.video_id)).toEqual(['newr0000001'])
  })
  it('a stored row that no longer matches its shelf is removed', async () => {
    const p = port([row('recipes', 'R0', 'Easy recipe ok', 100, 'okok0000001'), row('recipes', 'R0', 'My birthday vlog', 50, 'vlog0000001')])
    const r = await runBackfill(p, async () => page([]), async () => true, NOW, KEY)
    expect(r.removed).toBe(1)
    expect(p.remove).toHaveBeenCalledWith(['vlog0000001'])
  })
  it('the play check down (5+ checked, none answers): not ok, nothing written, nothing deleted', async () => {
    const p = port([row('recipes', PANLASANG.id, 'Easy recipe stays', 200, 'keep0000001')])
    const r = await runBackfill(p, apiOf(1, 4, 60), async () => { throw new Error('timeout') }, NOW, KEY)
    expect(r.ok).toBe(false)
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.remove).not.toHaveBeenCalled()
  })
  it('a quiet month (fewer than 5 to check) whose one stored video is gone still deletes it', async () => {
    const p = port([row('recipes', PANLASANG.id, 'Easy recipe gone', 200, 'gone0000002')])
    const r = await runBackfill(p, async () => page([]), async () => false, NOW, KEY)
    expect(r).toMatchObject({ ok: true, removed: 1, kept: 0 })
  })
  it('the budget: after 135 s no new play-check batch starts; unchecked stored rows stay, unchecked candidates are skipped', async () => {
    const stored = Array.from({ length: 25 }, (_, i) => row('recipes', 'R' + i, 'Easy recipe s' + i, 100 + i, 'stor' + String(i).padStart(7, '0')))
    let t = 0
    const p = port(stored)
    const calls: string[] = []
    // the clock moves 67.5 s per reading: it is past the budget by the third check of the clock
    const r = await runBackfill(p, async () => page([]), async (id) => { calls.push(id); return id === 'stor0000000' }, NOW, KEY, () => (t += BUDGET_MS / 2 + 1))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.length).toBeLessThan(25)
    expect(r.checked).toBe(calls.length)
    expect(r.skipped).toBe(25 - calls.length)
    expect(p.remove.mock.calls[0]?.[0] ?? []).toHaveLength(calls.length - 1) // only the checked-and-dead ones are deleted (one answered alive)
  })
  it('no API key: not ok with the no_key flag, no API call, nothing read or written', async () => {
    const p = port()
    const fetchJson = vi.fn(async () => page([]))
    for (const key of [undefined, '']) {
      const r = await runBackfill(p, fetchJson, async () => true, NOW, key)
      expect(r).toMatchObject({ ok: false, no_key: true, rows: 0, added: 0, removed: 0 })
    }
    expect(fetchJson).not.toHaveBeenCalled()
    expect(p.listEvergreen).not.toHaveBeenCalled()
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.remove).not.toHaveBeenCalled()
  })
  it('every channel fails (quota, bad key): not ok, nothing written or deleted; the key is not in the result', async () => {
    const p = port([row('recipes', PANLASANG.id, 'Easy recipe stays', 200, 'keep0000001')])
    const r = await runBackfill(p, async (u) => { throw new Error('HTTP403 ' + u.length) }, async () => false, NOW, KEY)
    expect(r).toMatchObject({ ok: false, channels_ok: 0, channels_failed: 7 })
    expect(JSON.stringify(r)).not.toContain(KEY)
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.remove).not.toHaveBeenCalled()
  })
  it('one channel failing on its first page counts as failed; a later page failing keeps what the earlier pages gave', async () => {
    const p = port()
    const api = async (u: string) => {
      const c = idOf(u)
      if (c.id === PRC.id) throw new Error('HTTP500')
      if (c.id === PANLASANG.id && tokenOf(u) === 't1') throw new Error('HTTP500')
      return apiOf(3, 2)(u)
    }
    const r = await runBackfill(p, api, async () => true, NOW, KEY)
    expect(r).toMatchObject({ ok: true, channels_ok: 6, channels_failed: 1 })
    expect(p.upsert.mock.calls[0]![0].filter((x) => x.channel_id === PANLASANG.id)).toHaveLength(2) // page 1 only
    expect(p.upsert.mock.calls[0]![0].filter((x) => x.channel_id === PRC.id)).toHaveLength(0)
  })
  it('a page that is not a playlist answer (a block page) counts as a failed channel', async () => {
    const r = await runBackfill(port(), async () => ({ error: { code: 403 } }), async () => true, NOW, KEY)
    expect(r).toMatchObject({ ok: false, channels_failed: 7 })
  })
})

describe('index.ts, cron and migration wiring (source guard; the function passed deno check)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('the secret check comes before the mode, the heartbeat is watch-backfill with counts only, the daily purge keeps evergreen rows, the key is read only from the environment', () => {
    expect(src.indexOf("req.headers.get('x-watch-secret')")).toBeLessThan(src.indexOf('req.json()'))
    expect(src.indexOf('req.json()')).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain("mode !== 'daily' && mode !== 'backfill'")
    expect(src).toContain("heartbeat(sb, 'watch-backfill'")
    for (const k of ['rows', 'added', 'removed', 'kept', 'checked', 'skipped', 'pages', 'channels_ok', 'channels_failed']) expect(src).toContain(`${k}: b.${k}`)
    expect(src).toContain("delete().eq('evergreen', false).lt('published_at'")
    expect(src).toContain("delete().eq('evergreen', true).in('video_id', ids)")
    expect(src).toContain("Deno.env.get('YT_API_KEY')")
    expect(src).not.toMatch(/\.(catch|finally)\(/)
  })
  it('the monthly cron calls watch-feed with {"mode":"backfill"} and the daily secret header; the migration adds the column and the down file removes it', () => {
    const cron = readFileSync(new URL('../../../ops/sql/watch_backfill_cron.sql', import.meta.url), 'utf8')
    expect(cron).toContain("'30 21 1 * *'")
    expect(cron).toContain('05:30 Manila')
    expect(cron).toContain("'x-watch-secret'")
    expect(cron).toContain("'watch_cron_secret'")
    expect(cron).toContain(`'{"mode":"backfill"}'::jsonb`)
    expect(cron).toContain('/functions/v1/watch-feed')
    expect(cron).toContain("jobname = 'watch-backfill'")
    const up = readFileSync(new URL('../../migrations/0068_watch_evergreen.sql', import.meta.url), 'utf8')
    expect(up).toContain('add column if not exists evergreen boolean not null default false')
    expect(up).not.toMatch(/^\s*grant /im)
    const down = readFileSync(new URL('../../migrations/0068_watch_evergreen.down.sql', import.meta.url), 'utf8')
    expect(down).toContain('drop column if exists evergreen')
  })
})
