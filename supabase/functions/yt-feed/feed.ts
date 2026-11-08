// yt-feed core (S25, D-155/D-159): the public YouTube channel RSS feeds of four Philippine news channels -> news_videos rows (Discover "Regional news").
// No key is needed. Only when every feed fails and the function has a YT_API_KEY secret does it read each channel's uploads playlist from the YouTube Data API instead.
// A row is kept only with a real video id, the channel we asked for, a title and a readable date; anything else is skipped, never repaired.
export const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id='
export const API_URL = 'https://www.googleapis.com/youtube/v3/playlistItems'
export const KEEP_DAYS = 3
export const LIVE_HOURS = 12 // a livestream placeholder older than this is a finished stream, not news
export const PER_CHANNEL = 15
export const CHANNELS: { id: string; label: string }[] = [
  { id: 'UCqYw-CTd1dU2yGI71sEyqNw', label: 'GMA News' },
  { id: 'UCE2606prvXQc_noEqKxVJXA', label: 'ABS-CBN News' },
  { id: 'UCiXhD6IScRs5r-tDvVvKjSA', label: 'Bilyonaryo' },
  { id: 'UCj5RwDivLksanrNvkW0FB4w', label: 'GMA Public Affairs' }
]
export interface NewsRow { video_id: string; channel_id: string; channel: string; title: string; published_at: string }

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ' }
  return NAMED[e.toLowerCase()] ?? m
})
const tag = (block: string, name: string) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block); return m ? decode(m[1]!).replace(/\s+/g, ' ').trim() : '' }
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIVE_TITLE = /\blive(?:stream)?\b/i

function toRow(c: { id: string; label: string }, video: string, channel: string, title: string, published: string, now: number): NewsRow | null {
  const t = Date.parse(published)
  if (!VIDEO_ID.test(video) || channel !== c.id || !title || !Number.isFinite(t) || t > now + 3_600_000) return null // a date in the future is a wrong date
  return { video_id: video, channel_id: c.id, channel: c.label, title: title.slice(0, 200), published_at: new Date(t).toISOString() }
}

/** Null when the text is not an Atom feed (a block page, an error); an empty list when it is a feed with no usable entry. `now` is epoch ms. */
export function parseFeed(xml: unknown, c: { id: string; label: string }, now: number): NewsRow[] | null {
  if (typeof xml !== 'string' || !/<feed[\s>]/.test(xml)) return null
  const out: NewsRow[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!
    const r = toRow(c, tag(e, 'yt:videoId'), tag(e, 'yt:channelId'), tag(e, 'title'), tag(e, 'published'), now)
    if (r) out.push(r)
  }
  return out
}

/** The uploads playlist of a channel is its id with UC swapped for UU. */
export const uploadsPlaylist = (channelId: string) => 'UU' + channelId.slice(2)

/** Null when the JSON is not a playlistItems answer. */
export function parsePlaylist(json: unknown, c: { id: string; label: string }, now: number): NewsRow[] | null {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return null
  const out: NewsRow[] = []
  for (const it of items as Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const s = it?.snippet ?? {}
    const r = toRow(c, String(s.resourceId?.videoId ?? ''), String(s.videoOwnerChannelId ?? s.channelId ?? ''), decode(String(s.title ?? '')).trim(), String(it?.contentDetails?.videoPublishedAt ?? s.publishedAt ?? ''), now)
    if (r) out.push(r)
  }
  return out
}

/** Newest first, no repeats, nothing older than KEEP_DAYS, no finished livestream, at most PER_CHANNEL per channel. */
export function pickFresh(rows: NewsRow[], now: number): NewsRow[] {
  const seen = new Set<string>()
  const per = new Map<string, number>()
  return rows
    .filter((r) => {
      const age = now - Date.parse(r.published_at)
      return age <= KEEP_DAYS * 86_400_000 && !(LIVE_TITLE.test(r.title) && age > LIVE_HOURS * 3_600_000)
    })
    .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0))
    .filter((r) => {
      if (seen.has(r.video_id)) return false
      seen.add(r.video_id)
      const n = (per.get(r.channel_id) ?? 0) + 1
      per.set(r.channel_id, n)
      return n <= PER_CHANNEL
    })
}

export interface Port {
  upsert(rows: (NewsRow & { fetched_at: string })[]): Promise<void>
  /** Deletes rows published before this ISO time. */
  purge(beforeIso: string): Promise<void>
}
export type Result = { ok: boolean; rows: number; source: 'rss' | 'api' | 'none' }

/** ML-24 worst case: 4 feeds x 15 s fetch timeout (60 s) plus 4 API reads x 15 s (60 s) is about 120 s, plus the write, under the 150 s Supabase Free edge limit. No budget check is needed while CHANNELS stays at 4.
 *  Reads every feed; the key (when there is one) is used only if no feed gave a readable answer. A failed read never trims the table. */
export async function runFeeds(port: Port, fetchText: (url: string) => Promise<string>, now: number, apiKey?: string): Promise<Result> {
  let rows: NewsRow[] = []
  let source: Result['source'] = 'none'
  let readable = 0
  for (const c of CHANNELS) {
    try {
      const got = parseFeed(await fetchText(FEED_URL + c.id), c, now)
      if (got) { readable++; rows = rows.concat(got) }
    } catch { /* this channel only: the others still count */ }
  }
  if (readable) source = 'rss'
  else if (apiKey) {
    for (const c of CHANNELS) {
      try {
        const url = `${API_URL}?part=snippet,contentDetails&maxResults=${PER_CHANNEL}&playlistId=${uploadsPlaylist(c.id)}&key=${encodeURIComponent(apiKey)}`
        let json: unknown = null
        try { json = JSON.parse(await fetchText(url)) } catch { /* not JSON */ }
        const got = parsePlaylist(json, c, now)
        if (got) { readable++; rows = rows.concat(got) }
      } catch { /* this channel only; the key is never put in a message */ }
    }
    if (readable) source = 'api'
  }
  if (!readable) return { ok: false, rows: 0, source: 'none' }
  const keep = pickFresh(rows, now)
  const fetched_at = new Date(now).toISOString()
  if (keep.length) await port.upsert(keep.map((r) => ({ ...r, fetched_at })))
  await port.purge(new Date(now - KEEP_DAYS * 86_400_000).toISOString())
  return { ok: true, rows: keep.length, source }
}
