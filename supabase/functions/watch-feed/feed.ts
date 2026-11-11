// watch-feed core (S33): the public YouTube channel RSS feeds of trusted Philippine channels -> watch_videos rows (the Discover Watch shelves: Be prepared, Farming and DIY, Recipe videos).
// No key is needed. Feed parsing is the yt-feed parser (one copy). A video is kept only when it is under 30 days old, not a Short, not a livestream, plays (oEmbed answers 200) and its title matches the shelf's words.
// The checked list in src/data/discover/ready.json stays the fallback in the app; this function only adds fresh rows.
import { FEED_URL, parseFeed } from '../yt-feed/feed.ts'

export { FEED_URL }
export type Shelf = 'prepping' | 'farm-diy' | 'recipes'
export interface Channel { id: string; label: string; shelf: Shelf }
export interface WatchRow { video_id: string; shelf: Shelf; channel_id: string; channel: string; title: string; published_at: string }

export const KEEP_DAYS = 30 // newest first: nothing older is shown
export const PURGE_DAYS = 60
export const PER_SHELF = 10
export const PER_CHANNEL = 5 // so one chatty channel (a daily forecast, a recipe a day) cannot fill a shelf alone
export const OEMBED = 'https://www.youtube.com/oembed?format=json&url='
/** YouTube oEmbed answer for one video: 200 plays here; 400, 401 (embedding off) and 404 (removed or private) are definite no; anything else (429 rate limit, 5xx, 403) is unknown and throws, so a passing YouTube outage never deletes a stored video. */
export const oembedPlayable = (status: number): boolean => { if (status === 200) return true; if (status === 400 || status === 401 || status === 404) return false; throw new Error(`oembed ${status}`) }

/** Every channel id below was read from the channel's own page and its RSS feed fetched on VERIFIED_ON: the feed answered 200, its author name matches, and the newest upload is under 60 days old.
 *  PAGASA and Philippine Red Cross are also the channels of the checked videos already in ready.json. */
export const VERIFIED_ON = '2026-11-11'
export const CHANNELS: Channel[] = [
  { id: 'UCpyLikj1x70S8UPxVqsPr6g', label: 'DOST-PAGASA', shelf: 'prepping' }, // feed author "DOST-PAGASA Weather Report", newest 2026-11-11
  { id: 'UCGHvTM8z9r8zd49VyKbD-dA', label: 'Philippine Red Cross', shelf: 'prepping' }, // "Philippine Red Cross Official", newest 2026-11-09
  { id: 'UCil7YQ9Hwc2mTTQcaRw1InA', label: 'Office of Civil Defense', shelf: 'prepping' }, // "Civil Defense PH" (@civildefensePH), its page says "The Office of Civil Defense...", newest 2026-10-27
  { id: 'UCDzepTQPbPhpD-Yof-AQ-rw', label: 'Department of Agriculture', shelf: 'farm-diy' }, // "Department of Agriculture - Philippines", newest 2026-10-16
  { id: 'UCrtbYU40QsuSTYFIaEM_Cyw', label: 'Agricultural Training Institute', shelf: 'farm-diy' }, // "ATI Central Office" (its page: the official channel of ATI), newest 2026-11-04
  { id: 'UCIjw46txjW6oD4NU6FHaj_w', label: 'Panlasang Pinoy', shelf: 'recipes' }, // newest 2026-11-08
  { id: 'UCqwRZhIEyiQ3cMCLQ9hI88Q', label: 'Kawaling Pinoy', shelf: 'recipes' } // newest 2026-11-09
]
/** Looked for and left out on VERIFIED_ON (kept here so nobody adds them back unchecked). */
export const DROPPED: { id: string; label: string; why: string }[] = [
  { id: 'UCN3X82DlKERhMyl_R-lG5tA', label: 'NDRRMC (@Ndrrmc_97)', why: 'no upload in 60 days (newest 2026-07-12)' },
  { id: 'UCLzoX-CQSh4Nc1PXKpoRKTQ', label: 'Department of Agriculture - Philippines (@dacentralph)', why: 'no upload in 60 days (newest 2025-06-17); the live DA channel is the one in CHANNELS' }
]

/** Hand-picked words per shelf, English and Filipino. A title must start a word with one of them (so "evacuat" finds "evacuation"). `not` drops time-bound posts that are stale in days. */
export const SHELF_WORDS: Record<Shelf, { en: string[]; tl: string[]; not: string[] }> = {
  prepping: {
    en: ['typhoon', 'storm', 'flood', 'earthquake', 'tsunami', 'volcano', 'landslide', 'evacuat', 'disaster', 'prepar', 'save a life','emergency', 'first aid', 'go bag', 'survival', 'safety', 'rescue', 'cpr!', 'drill', 'relief', 'resilien', 'hazard', 'signal no', 'tropical cyclone'],
    tl: ['bagyo', 'baha!', 'lindol', 'sunog', 'sakuna', 'kalamidad', 'handa', 'paghahanda', 'kaligtasan', 'ligtas', 'unang lunas', 'paglikas', 'bulkan', 'sagip'],
    not: ['bulletin', 'forecast', 'advisory', 'briefing', 'situational', 'update', 'press conference']
  },
  'farm-diy': {
    en: ['farm', 'agri', 'crop', 'rice', 'palay', 'corn', 'vegetable', 'garden', 'plant', 'seedling', 'soil', 'fertilizer', 'organic', 'livestock', 'poultry', 'hog!', 'piggery', 'goat', 'aquaculture', 'tilapia', 'harvest', 'irrigation', 'compost', 'mushroom', 'hydroponic', 'coconut', 'banana', 'cacao', 'coffee', 'pest', 'training', 'kadiwa', 'diy!'],
    tl: ['magsasaka', 'sakahan', 'pananim', 'palayan', 'gulay', 'halaman', 'pataba', 'binhi', 'alaga', 'manok', 'baboy', 'isda', 'tanim', 'pagtatanim', 'pagsasaka', 'pag-aani', 'kabuhayan', 'sibuyas'],
    not: ['press statement', 'press briefing', 'kadiwa ng pangulo']
  },
  recipes: {
    en: ['recipe', 'cook', 'bake', 'baking', 'fry', 'adobo', 'sinigang', 'stew', 'soup', 'chicken', 'pork', 'beef', 'fish', 'shrimp', 'rice', 'noodle', 'pancit', 'lomi', 'dessert', 'cake', 'bread', 'egg', 'vegetable', 'one-pan', 'one pan', 'kitchen', 'dinner', 'lunch', 'breakfast', 'snack', 'kakanin', 'leche flan', 'lumpia', 'sisig', 'kare-kare', 'tinola', 'how to make'],
    tl: ['luto', 'luluto', 'lutuin', 'lutong', 'paano gumawa', 'ulam', 'pagkain', 'sarap', 'sabaw', 'prito', 'ginisa', 'ginataan', 'meryenda', 'pang-ulam'],
    not: []
  }
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A word ending in "!" must be the whole word ("baha!" is a flood, not "bahay", a house). */
const alt = (list: string[]) => list.map((w) => (w.endsWith('!') ? esc(w.slice(0, -1)) + '(?![\\p{L}\\p{N}])' : esc(w))).join('|')
const START = '(?:^|[^\\p{L}\\p{N}])'
const TL_PREFIX = '(?:napaka|pinaka|ma|mag|pag|nag|ka)?' // "napakasarap" and "kaligtasan" are the Filipino word with a common prefix
const MATCH = Object.fromEntries((Object.keys(SHELF_WORDS) as Shelf[]).map((s) => {
  const w = SHELF_WORDS[s]
  return [s, { yes: new RegExp(`${START}(?:${TL_PREFIX}(?:${alt(w.tl)})|${alt(w.en)})`, 'iu'), no: w.not.length ? new RegExp(`${START}(?:${alt(w.not)})`, 'iu') : null }]
})) as Record<Shelf, { yes: RegExp; no: RegExp | null }>
export const matchesShelf = (shelf: Shelf, title: string): boolean => MATCH[shelf].yes.test(title) && !MATCH[shelf].no?.test(title)

const LIVE_TITLE = /\blive(?:\s?stream(?:ing)?)?\b|🔴/iu
const SHORT_TITLE = /#shorts?\b/i
/** A livestream placeholder or a Short by its title. */
export const isShortOrLive = (title: string) => LIVE_TITLE.test(title) || SHORT_TITLE.test(title)

/** Ids of the entries whose link is a /shorts/ page. */
export function shortIds(xml: string): Set<string> {
  const out = new Set<string>()
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1]
    if (id && /<link[^>]*href="[^"]*\/shorts\//.test(e)) out.add(id)
  }
  return out
}

/** Within 30 days, no Short or livestream, title matches its shelf, no repeats, newest first, at most PER_CHANNEL per channel and PER_SHELF per shelf. `now` is epoch ms. */
export function pickWatch(rows: WatchRow[], now: number): WatchRow[] {
  const seen = new Set<string>()
  const perChannel = new Map<string, number>()
  const perShelf = new Map<Shelf, number>()
  return rows
    .filter((r) => now - Date.parse(r.published_at) <= KEEP_DAYS * 86_400_000 && !isShortOrLive(r.title) && matchesShelf(r.shelf, r.title))
    .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0))
    .filter((r) => {
      if (seen.has(r.video_id)) return false
      seen.add(r.video_id)
      const c = (perChannel.get(r.channel_id) ?? 0) + 1
      if (c > PER_CHANNEL) return false
      perChannel.set(r.channel_id, c)
      const s = (perShelf.get(r.shelf) ?? 0) + 1
      if (s > PER_SHELF) return false
      perShelf.set(r.shelf, s)
      return true
    })
}

export interface Port {
  upsert(rows: (WatchRow & { fetched_at: string })[]): Promise<void>
  /** Deletes rows published before this ISO time. */
  purge(beforeIso: string): Promise<void>
}
export type Result = { ok: boolean; rows: number; kept: number; dropped: number; channels_ok: number; channels_failed: number }

/** ML-24 worst case: the 7 feeds are read at once (one 10 s timeout, 10 s), then at most 30 candidates (3 shelves x 10) are checked 10 at a time (3 batches x 8 s oEmbed timeout, 24 s), then one write: about 40 s under the 150 s Supabase Free edge limit.
 *  A run where no feed answered, or every candidate failed the play check, writes and trims nothing (a failed read never empties the table) and reports ok false. */
export async function runWatch(port: Port, fetchText: (url: string) => Promise<string>, playable: (videoId: string) => Promise<boolean>, now: number): Promise<Result> {
  const got = await Promise.all(CHANNELS.map(async (c): Promise<WatchRow[] | null> => {
    try {
      const xml = await fetchText(FEED_URL + c.id)
      const rows = parseFeed(xml, c, now)
      if (!rows) return null
      const shorts = shortIds(xml)
      return rows.filter((r) => !shorts.has(r.video_id)).map((r) => ({ video_id: r.video_id, shelf: c.shelf, channel_id: c.id, channel: c.label, title: r.title, published_at: r.published_at }))
    } catch { return null } // this channel only: the others still count
  }))
  const channels_ok = got.filter((g) => g !== null).length
  const channels_failed = got.length - channels_ok
  const rows = got.flat().filter((r): r is WatchRow => r !== null)
  const fail = { ok: false, rows: rows.length, kept: 0, dropped: rows.length, channels_ok, channels_failed }
  if (!channels_ok) return fail
  const cand = pickWatch(rows, now)
  const alive = new Set<string>()
  for (let i = 0; i < cand.length; i += 10) {
    await Promise.all(cand.slice(i, i + 10).map(async (r) => { try { if (await playable(r.video_id)) alive.add(r.video_id) } catch { /* not playable now: left out */ } }))
  }
  const keep = cand.filter((r) => alive.has(r.video_id))
  if (cand.length >= 5 && !keep.length) return fail // 5+ candidates all failing means the play check is down; 1-2 removed videos on a quiet day is not a failure
  const fetched_at = new Date(now).toISOString()
  if (keep.length) await port.upsert(keep.map((r) => ({ ...r, fetched_at })))
  await port.purge(new Date(now - PURGE_DAYS * 86_400_000).toISOString())
  return { ok: true, rows: rows.length, kept: keep.length, dropped: rows.length - keep.length, channels_ok, channels_failed }
}
