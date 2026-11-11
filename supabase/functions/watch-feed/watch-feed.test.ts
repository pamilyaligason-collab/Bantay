// @vitest-environment node
// The three fixtures are real channel feeds captured 2026-11-11 (Philippine Red Cross Official, DOST-PAGASA Weather Report, Panlasang Pinoy), trimmed to their first 3 or 4 entries and stripped of descriptions (public video titles only, no personal data).
// Expected values are hand-read from them, not copied from the code.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { CHANNELS, DROPPED, FEED_URL, KEEP_DAYS, matchesShelf, PER_CHANNEL, PER_SHELF, pickWatch, runWatch, SHELF_WORDS, shortIds, type Shelf, type WatchRow } from './feed.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}.xml`, import.meta.url), 'utf8')
const PRC = CHANNELS.find((c) => c.label === 'Philippine Red Cross')!
const PAGASA = CHANNELS.find((c) => c.label === 'DOST-PAGASA')!
const PANLASANG = CHANNELS.find((c) => c.label === 'Panlasang Pinoy')!
const NOW = Date.parse('2026-11-11T10:00:00Z')
const DAY = 86_400_000

describe('channel list', () => {
  it('real ids, no repeats, none of the dropped ones, every shelf covered', () => {
    expect(CHANNELS).toHaveLength(7)
    for (const c of CHANNELS) expect(c.id).toMatch(/^UC[A-Za-z0-9_-]{22}$/)
    expect(new Set(CHANNELS.map((c) => c.id)).size).toBe(CHANNELS.length)
    for (const d of DROPPED) expect(CHANNELS.map((c) => c.id)).not.toContain(d.id)
    expect([...new Set(CHANNELS.map((c) => c.shelf))].sort()).toEqual(['farm-diy', 'prepping', 'recipes'])
    expect(CHANNELS.map((c) => c.shelf)).toEqual(['prepping', 'prepping', 'prepping', 'farm-diy', 'farm-diy', 'recipes', 'recipes'])
  })
  it('the budget in runWatch holds: 3 shelves x 10 candidates at most, checked 10 at a time', () => {
    expect(PER_SHELF).toBe(10)
    expect(KEEP_DAYS).toBe(30)
    expect(PER_CHANNEL).toBe(4)
  })
})

describe('shortIds', () => {
  it('finds the two Shorts in the Panlasang Pinoy feed by their /shorts/ link, and none in the Red Cross feed', () => {
    expect([...shortIds(fx('panlasang'))].sort()).toEqual(['QxuO9K8rfUg', 'tTZn4gHl8qs'])
    expect(shortIds(fx('prc')).size).toBe(0)
  })
})

describe('matchesShelf (hand-picked English and Filipino words)', () => {
  const yes: [Shelf, string][] = [
    ['prepping', '13 YEARS AFTER YOLANDA: WE REMEMBER, WE REBUILD, WE PREPARE'], ['prepping', 'Typhoon safety: what to pack in your go bag'], ['prepping', 'Paano maligtas sa lindol'], ['prepping', 'Kaligtasan sa baha at bagyo'],
    ['prepping', 'Two Hands Can Save a Life'], ['prepping', 'CPR sa bahay'], ['prepping', 'Evacuation drill in Barangay 5'],
    ['farm-diy', 'Gulayan sa Pamayanan: starting a backyard garden'], ['farm-diy', 'Agritalk Video Series: The Rabbit Story'], ['farm-diy', 'Pagtatanim ng palay'], ['farm-diy', 'Hog raising for beginners'],
    ['recipes', 'Gawin Mo Ito Sa Chicken Afritada, Ang Sarap!'], ['recipes', 'Gawin Mo Ito Sa Puso ng Saging, Napakasarap!'], ['recipes', 'Authentic Pinakbet Tagalog in One Pan (with Pork Belly)'], ['recipes', 'Paano gumawa ng leche flan']
  ]
  const no: [Shelf, string][] = [
    ['prepping', 'Public Weather Forecast issued at 5:00 PM | November 11, 2026 - Wednesday'], ['prepping', 'Typhoon update 5 PM'], ['prepping', 'TYPE MO TYPE KO [ ISANG DUGO TAYO]'], ['prepping', 'Bahay Kubo tour'], ['prepping', 'Press briefing on the storm'],
    ['prepping', 'Cprime launch'], ['farm-diy', 'Press Statement of DA - Acting Secretary'], ['farm-diy', 'Kadiwa ng Pangulo at Camp Crame'], ['farm-diy', 'Hogwarts review'], ['farm-diy', 'Meeting of the board'],
    ['recipes', 'My birthday vlog'], ['recipes', 'Q and A with Vanjo']
  ]
  it.each(yes)('%s keeps "%s"', (shelf, title) => expect(matchesShelf(shelf, title)).toBe(true))
  it.each(no)('%s drops "%s"', (shelf, title) => expect(matchesShelf(shelf, title)).toBe(false))
  it('every shelf has English and Filipino words', () => {
    for (const s of Object.values(SHELF_WORDS)) { expect(s.en.length).toBeGreaterThan(5); expect(s.tl.length).toBeGreaterThan(5) }
  })
})

describe('pickWatch', () => {
  let n = 0
  const row = (shelf: Shelf, ch: string, title: string, daysAgo: number, id?: string): WatchRow => ({ video_id: id ?? 'v' + String(++n).padStart(10, '0'), shelf, channel_id: ch, channel: ch, title, published_at: new Date(NOW - daysAgo * DAY).toISOString() })
  it('30 days is kept, 31 is not; a livestream, a #shorts title and a repeat are dropped; newest first', () => {
    const got = pickWatch([row('recipes', 'A', 'Easy recipe old', 31), row('recipes', 'A', 'Easy recipe edge', 30), row('recipes', 'A', 'Recipe LIVE: cooking', 1), row('recipes', 'A', 'Recipe 🔴 now', 1), row('recipes', 'A', 'Quick recipe #shorts', 1), row('recipes', 'A', 'Easy recipe new', 2, 'same0000001'), row('recipes', 'A', 'Easy recipe new', 2, 'same0000001')], NOW)
    expect(got.map((r) => r.title)).toEqual(['Easy recipe new', 'Easy recipe edge'])
  })
  it('keeps "Alive" and "Delivery" (the word live is a whole word) and a title that only mentions a short', () => {
    const got = pickWatch([row('recipes', 'A', 'Recipe for a delivery day', 1), row('recipes', 'A', 'Recipe: how to stay alive in the kitchen', 2), row('recipes', 'A', 'Shortcut recipe', 3)], NOW)
    expect(got).toHaveLength(3)
  })
  it('at most 4 per channel', () => {
    const got = pickWatch(Array.from({ length: 9 }, (_, i) => row('recipes', 'A', 'Easy recipe ' + i, i + 1)), NOW)
    expect(got).toHaveLength(4)
    expect(got.map((r) => r.title)).toEqual(['Easy recipe 0', 'Easy recipe 1', 'Easy recipe 2', 'Easy recipe 3'])
  })
  it('at most 10 per shelf (3 channels x 4 = 12 offered), the newest 10 win', () => {
    const rows = ['A', 'B', 'C'].flatMap((ch, c) => Array.from({ length: 4 }, (_, i) => row('prepping', ch, 'Typhoon safety ' + ch + i, c * 0.1 + i + 1)))
    const got = pickWatch(rows, NOW)
    expect(got).toHaveLength(10)
    const dropped = rows.filter((r) => !got.includes(r)).map((r) => r.title)
    expect(dropped.sort()).toEqual(['Typhoon safety B3', 'Typhoon safety C3']) // the two oldest of the twelve (4.1 and 4.2 days)
  })
  it('a shelf cap does not eat another shelf', () => {
    const rows = [...Array.from({ length: 12 }, (_, i) => row('prepping', 'P' + (i % 3), 'Typhoon ' + i, i + 1)), row('recipes', 'R', 'Easy recipe', 20)]
    expect(pickWatch(rows, NOW).filter((r) => r.shelf === 'recipes')).toHaveLength(1)
  })
})

describe('runWatch', () => {
  const port = () => ({ upsert: vi.fn(async (_r: { video_id: string; shelf: string; fetched_at: string }[]) => undefined), purge: vi.fn(async (_d: string) => undefined) })
  const feeds: Record<string, string> = { [FEED_URL + PRC.id]: fx('prc'), [FEED_URL + PAGASA.id]: fx('pagasa'), [FEED_URL + PANLASANG.id]: fx('panlasang') }
  const fetchText = vi.fn(async (u: string) => { if (u in feeds) return feeds[u]!; throw new Error('HTTP404') })

  it('three feeds answer, four fail: Shorts, forecasts and non-matching titles drop, the rest is upserted with its shelf and the 60-day purge runs', async () => {
    const p = port()
    const r = await runWatch(p, fetchText, async () => true, NOW)
    // rows read: Red Cross 4 + PAGASA 3 + Panlasang 4 minus its 2 Shorts = 9. Kept by hand: Red Cross "WE PREPARE" and "Save a Life"; Panlasang "Napakasarap" and "Chicken Afritada, Ang Sarap" = 4.
    expect(r).toEqual({ ok: true, rows: 9, kept: 4, dropped: 5, channels_ok: 3, channels_failed: 4 })
    const up = p.upsert.mock.calls[0]![0]
    expect(up.map((x) => [x.video_id, x.shelf]).sort()).toEqual([['Bh4m7_L4fVk', 'prepping'], ['ZJvkQgGqFxE', 'recipes'], ['_Ij4RaUoSzg', 'prepping'], ['dS1qP3W7rg0', 'recipes']])
    expect(up.every((x) => x.fetched_at === '2026-11-11T10:00:00.000Z')).toBe(true)
    expect(p.purge).toHaveBeenCalledWith('2026-09-12T10:00:00.000Z') // now minus 60 days
  })
  it('a video the play check refuses (oEmbed not 200) is left out', async () => {
    const p = port()
    const r = await runWatch(p, fetchText, async (id) => id !== 'Bh4m7_L4fVk', NOW)
    expect(r.kept).toBe(3)
    expect(p.upsert.mock.calls[0]![0].map((x) => x.video_id)).not.toContain('Bh4m7_L4fVk')
  })
  it('no feed answers: nothing is written or trimmed and the run is not ok', async () => {
    const p = port()
    const r = await runWatch(p, async () => { throw new Error('HTTP500') }, async () => true, NOW)
    expect(r).toEqual({ ok: false, rows: 0, kept: 0, dropped: 0, channels_ok: 0, channels_failed: 7 })
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.purge).not.toHaveBeenCalled()
  })
  it('a block page instead of a feed counts as a failed channel', async () => {
    const r = await runWatch(port(), async (u) => (u === FEED_URL + PRC.id ? fx('prc') : '<html>429</html>'), async () => true, NOW)
    expect(r.channels_ok).toBe(1)
    expect(r.channels_failed).toBe(6)
  })
  it('the play check itself down (every call fails): not ok, nothing written or trimmed', async () => {
    const p = port()
    const r = await runWatch(p, fetchText, async () => { throw new Error('timeout') }, NOW)
    expect(r.ok).toBe(false)
    expect(r.kept).toBe(0)
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.purge).not.toHaveBeenCalled()
  })
  it('feeds fine but nothing matches: ok, kept 0, the purge still runs', async () => {
    const p = port()
    const r = await runWatch(p, async (u) => (u === FEED_URL + PAGASA.id ? fx('pagasa') : (() => { throw new Error('HTTP404') })()), async () => true, NOW)
    expect(r).toMatchObject({ ok: true, rows: 3, kept: 0, dropped: 3, channels_ok: 1, channels_failed: 6 })
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.purge).toHaveBeenCalledTimes(1)
  })
  it('checks at most 10 videos at a time and never more than 26 here (10 prepping, 8 farm, 8 recipes)', async () => {
    const entry = (id: string, ch: string, title: string, h: number) => `<entry><yt:videoId>${id}</yt:videoId><yt:channelId>${ch}</yt:channelId><title>${title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/><published>${new Date(NOW - h * 3_600_000).toISOString()}</published></entry>`
    let k = 0
    const word: Record<string, string> = { prepping: 'Typhoon safety', 'farm-diy': 'Farm tips', recipes: 'Easy recipe' }
    const xmls = Object.fromEntries(CHANNELS.map((c) => [FEED_URL + c.id, `<feed>${Array.from({ length: 5 }, (_, i) => entry('vid' + String(k++).padStart(8, '0'), c.id, `${word[c.shelf]} ${i}`, k + 1)).join('')}</feed>`]))
    let live = 0, peak = 0, calls = 0
    const p = port()
    const r = await runWatch(p, async (u) => xmls[u]!, async () => { calls++; live++; peak = Math.max(peak, live); await new Promise((res) => setTimeout(res, 2)); live--; return true }, NOW)
    expect(calls).toBe(10 + 8 + 8)
    expect(peak).toBe(10)
    expect(r).toMatchObject({ ok: true, rows: 35, kept: 26, channels_ok: 7 })
    expect(p.upsert.mock.calls[0]![0]).toHaveLength(26)
  })
})

describe('index.ts wiring (source guard; the function itself passed deno check)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the secret header before any work, upserts on video_id, beats on watch-feed, and never chains .catch on a builder', () => {
    expect(src.indexOf("req.headers.get('x-watch-secret')")).toBeGreaterThan(-1)
    expect(src.indexOf("req.headers.get('x-watch-secret')")).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain("onConflict: 'video_id'")
    expect(src).toContain('WATCH_CRON_SECRET')
    expect(src).toContain("heartbeat(sb, 'watch-feed'")
    expect(src).toContain('AbortSignal.timeout')
    expect(src).not.toMatch(/\.(catch|finally)\(/)
    for (const k of ['rows', 'kept', 'dropped', 'channels_ok', 'channels_failed']) expect(src).toContain(`${k}: result.${k}`)
  })
  it('the cron file and the migration use the same names', () => {
    const cron = readFileSync(new URL('../../../ops/sql/watch_feed_cron.sql', import.meta.url), 'utf8')
    expect(cron).toContain("'watch_cron_secret'")
    expect(cron).toContain("'x-watch-secret'")
    expect(cron).toContain("'0 21 * * *'")
    expect(cron).toContain('/functions/v1/watch-feed')
    const sql = readFileSync(new URL('../../migrations/0067_watch_videos.sql', import.meta.url), 'utf8')
    expect(sql).toContain("check (shelf in ('prepping', 'farm-diy', 'recipes'))")
    expect(sql).toMatch(/grant select on public\.watch_videos to authenticated;/)
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*to authenticated/)
  })
})
