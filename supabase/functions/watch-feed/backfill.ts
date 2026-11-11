// watch-feed back catalogue (S34): older uploads of the same 7 verified channels -> watch_videos rows with evergreen = true (the Watch shelves' "More from these channels").
// Needs YT_API_KEY (YouTube Data API playlistItems on each channel's uploads playlist; the RSS feed holds only the newest 15). Same filters as the daily run EXCEPT the age limit; only videos older than KEEP_DAYS,
// so a fresh row (the daily run's) is never flipped to evergreen. Existing evergreen rows are re-checked with oEmbed and deleted when they no longer play.
import { API_URL, parsePlaylist, uploadsPlaylist } from '../yt-feed/feed.ts'
import { CHANNELS, isShortOrLive, KEEP_DAYS, matchesShelf, type Shelf, type WatchRow } from './feed.ts'

export const BACKFILL_PAGES = 4 // pages of 50 per channel
export const PAGE_SIZE = 50
export const EVERGREEN_PER_CHANNEL = 10
export const EVERGREEN_PER_SHELF = 30
export const PAGE_STOP_MS = 50_000 // no new page is asked for after this
export const BUDGET_MS = 135_000 // no new play-check batch starts after this: the batch (8 s timeout) still ends under the 150 s Supabase Free limit (ML-24)
const BATCH = 10
const BATCH_MS = 8_000

/** Older than KEEP_DAYS, no Short or livestream by title, title matches its shelf, no repeats, newest first, at most 10 per channel and 30 per shelf. `now` is epoch ms. Age has no upper limit. */
export function pickEvergreen(rows: WatchRow[], now: number): WatchRow[] {
  const seen = new Set<string>()
  const perChannel = new Map<string, number>()
  const perShelf = new Map<Shelf, number>()
  return rows
    .filter((r) => now - Date.parse(r.published_at) > KEEP_DAYS * 86_400_000 && !isShortOrLive(r.title) && matchesShelf(r.shelf, r.title))
    .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0))
    .filter((r) => {
      if (seen.has(r.video_id)) return false
      seen.add(r.video_id)
      const c = (perChannel.get(r.channel_id) ?? 0) + 1
      if (c > EVERGREEN_PER_CHANNEL) return false
      perChannel.set(r.channel_id, c)
      const s = (perShelf.get(r.shelf) ?? 0) + 1
      if (s > EVERGREEN_PER_SHELF) return false
      perShelf.set(r.shelf, s)
      return true
    })
}

export interface BackfillPort {
  /** The evergreen rows now in the table. */
  listEvergreen(): Promise<WatchRow[]>
  upsert(rows: (WatchRow & { fetched_at: string; evergreen: true })[]): Promise<void>
  /** Deletes evergreen rows by video id (never a fresh row). */
  remove(ids: string[]): Promise<void>
}
export type BackfillResult = { ok: boolean; no_key?: true; rows: number; added: number; removed: number; kept: number; checked: number; skipped: number; pages: number; channels_ok: number; channels_failed: number }
const NO_COUNTS = { rows: 0, added: 0, removed: 0, kept: 0, checked: 0, skipped: 0, pages: 0, channels_ok: 0, channels_failed: 0 }

/** ML-24 worst case: the 7 channels page at once, one page after another (8 s fetch timeout, no page asked after 50 s: at most 58 s); then play checks 10 at a time (8 s each batch), no batch starts after 135 s: at most 143 s, plus one write.
 *  No key: ok false, nothing read or written. No channel readable, or 5+ checks all failing (the play check is down), writes and deletes nothing. `clock` is epoch ms (injected in tests). */
export async function runBackfill(port: BackfillPort, fetchJson: (url: string) => Promise<unknown>, playable: (videoId: string) => Promise<boolean>, now: number, apiKey: string | undefined, clock: () => number = Date.now): Promise<BackfillResult> {
  if (!apiKey) return { ok: false, no_key: true, ...NO_COUNTS }
  const started = clock()
  let pages = 0
  const got = await Promise.all(CHANNELS.map(async (c): Promise<WatchRow[] | null> => {
    const out: WatchRow[] = []
    let token = ''
    for (let p = 0; p < BACKFILL_PAGES; p++) {
      if (p > 0 && (!token || clock() - started > PAGE_STOP_MS)) break
      try {
        const url = `${API_URL}?part=snippet,contentDetails&maxResults=${PAGE_SIZE}&playlistId=${uploadsPlaylist(c.id)}${token ? '&pageToken=' + encodeURIComponent(token) : ''}&key=${encodeURIComponent(apiKey)}`
        const json = await fetchJson(url)
        const rows = parsePlaylist(json, c, now)
        if (!rows) return p === 0 ? null : out
        pages++
        for (const r of rows) out.push({ video_id: r.video_id, shelf: c.shelf, channel_id: c.id, channel: c.label, title: r.title, published_at: r.published_at })
        token = String((json as { nextPageToken?: unknown }).nextPageToken ?? '')
      } catch { return p === 0 ? null : out } // this channel only; the key is never put in a message
    }
    return out
  }))
  const channels_ok = got.filter((g) => g !== null).length
  const channels_failed = got.length - channels_ok
  const rows = got.flat().filter((r): r is WatchRow => r !== null)
  const base = { rows: rows.length, pages, channels_ok, channels_failed }
  if (!channels_ok) return { ok: false, ...NO_COUNTS, ...base }

  const existing = await port.listEvergreen()
  const have = new Set(existing.map((r) => r.video_id))
  const fresh = pickEvergreen(rows, now).filter((r) => !have.has(r.video_id))
  const queue = [...existing, ...fresh] // existing rows first: removing a dead video matters more than adding one
  const alive = new Set<string>()
  const dead = new Set<string>()
  let checked = 0
  for (let i = 0; i < queue.length; i += BATCH) {
    if (clock() - started > BUDGET_MS) break
    await Promise.all(queue.slice(i, i + BATCH).map(async (r) => {
      try { (await playable(r.video_id)) ? alive.add(r.video_id) : dead.add(r.video_id) } catch { /* answer unknown: neither kept as checked nor deleted */ }
    }))
    checked += Math.min(BATCH, queue.length - i)
  }
  const unknown = queue.length - alive.size - dead.size
  if (queue.length >= 5 && !alive.size) return { ok: false, ...NO_COUNTS, ...base, checked, skipped: unknown } // the play check is down, or every video is gone: change nothing
  const live = existing.filter((r) => !dead.has(r.video_id)) // unchecked rows stay
  const final = pickEvergreen([...live, ...fresh.filter((r) => alive.has(r.video_id))], now)
  const keepIds = new Set(final.map((r) => r.video_id))
  const remove = existing.filter((r) => !keepIds.has(r.video_id)).map((r) => r.video_id)
  const add = final.filter((r) => !have.has(r.video_id))
  const fetched_at = new Date(now).toISOString()
  if (add.length) await port.upsert(add.map((r) => ({ ...r, fetched_at, evergreen: true as const })))
  if (remove.length) await port.remove(remove)
  return { ok: true, ...base, added: add.length, removed: remove.length, kept: final.length, checked, skipped: unknown }
}
