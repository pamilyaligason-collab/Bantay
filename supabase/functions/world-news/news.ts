// world-news core: public RSS feeds -> world_news rows (World "Macro and news") and news_items rows (Discover, by topic). GDELT is gone (it refused every query).
// Headlines are third-party text: stored as plain strings, never interpreted. A failed feed keeps the rows already stored; nothing is deleted except rows older than 7 days (purge).
import { gdacsKeep, isClickbait, isWellbeingStory, phImpact } from './rules.ts'
export const KEEP_DAYS = 7
export const GAP_MS = 1_500 // polite delay between feeds
export const BUDGET_MS = 110_000 // no new feed starts after this; one feed takes at most 12 s (index.ts), under the 150 s edge limit (ML-24)
export const MAX_PER_FEED = 15
export type Topic = 'prepping' | 'health' | 'national' | 'wellbeing'
export interface Feed { url: string; source: string; world?: boolean; topic?: Topic; noImage?: boolean; geo?: boolean; /** news_items.zone (0017): shown only to people in that Quick dial area; unset = everyone */ zone?: string }
export const FEEDS: Feed[] = [
  { url: 'https://www.who.int/rss-feeds/news-english.xml', source: 'WHO', world: true, topic: 'health' }, // may be blocked from a datacenter; harmless
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC', world: true, noImage: true }, // no BBC images (licence)
  { url: 'https://www.gdacs.org/xml/rss.xml', source: 'GDACS', topic: 'prepping', geo: true }, // only events in or near the Philippines (rules.ts)
  { url: 'https://newsinfo.inquirer.net/tag/weather/feed', source: 'Inquirer', topic: 'prepping' },
  { url: 'https://www.rappler.com/environment/disasters/feed/', source: 'Rappler', topic: 'prepping' },
  { url: 'https://newsinfo.inquirer.net/tag/health/feed', source: 'Inquirer', topic: 'health' },
  { url: 'https://data.gmanetwork.com/gno/rss/lifestyle/healthandwellness/feed.xml', source: 'GMA News', topic: 'health' },
  { url: 'https://newsinfo.inquirer.net/tag/mental-health/feed', source: 'Inquirer', topic: 'wellbeing' },
  { url: 'https://data.gmanetwork.com/gno/rss/lifestyle/feed.xml', source: 'GMA News', topic: 'wellbeing' },
  { url: 'https://www.inquirer.net/fullfeed', source: 'Inquirer', topic: 'national' },
  { url: 'https://www.rappler.com/feed/', source: 'Rappler', topic: 'national' },
  { url: 'https://data.gmanetwork.com/gno/rss/news/feed.xml', source: 'GMA News', topic: 'national' },
  { url: 'https://www.philstar.com/rss/headlines', source: 'Philstar', topic: 'national' },
  // S30 C5: Texas members see Texas and US national headlines (zone texas, 0017). Both answered a valid RSS document with items on 2026-11-11 (checked by hand: 200, <item><title> present). No pictures: their licence is not checked.
  { url: 'https://www.houstonpublicmedia.org/feed/', source: 'Houston Public Media', topic: 'national', zone: 'texas', noImage: true },
  { url: 'https://feeds.npr.org/1001/rss.xml', source: 'NPR', topic: 'national', zone: 'texas', noImage: true },
  { url: 'https://news.google.com/rss/search?q=typhoon+OR+PAGASA+OR+%22oil+prices%22+OR+Hormuz+OR+peso+Philippines&hl=en-PH&gl=PH&ceid=PH:en', source: 'Google News PH', world: true } // PH-impact headlines from many outlets; the source tag names the outlet
]

export interface WorldRow { id: string; title: string; url: string; source_domain: string; seen_at: string; lang: string; theme: string }
export interface ItemRow { id: string; title: string; url: string; source: string; kind: 'article'; published_at: string; topic: Topic; image_url: string | null; zone?: string }
export interface Entry { title: string; url: string; at: string; source: string; image: string | null; desc?: string; lat?: number; lon?: number; country?: string }

/** Plain text, one line, at most 200 characters; control characters are dropped. */
export const cleanTitle = (s: string) => Array.from(s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 200).join('')

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** Strip CDATA wrappers and tags, then decode the usual entities once. */
export function xmlText(s: string): string {
  const raw = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  return raw.replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ' }
    return NAMED[e.toLowerCase()] ?? m
  })
}

const tag = (block: string, name: string) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block); return m ? xmlText(m[1]!).trim() : '' }
const attr = (block: string, el: string, a: string, need?: RegExp) => {
  for (const m of block.matchAll(new RegExp(`<${el}\\s[^>]*>`, 'gi'))) {
    const v = new RegExp(`\\b${a}\\s*=\\s*"([^"]+)"`, 'i').exec(m[0])?.[1]
    if (v && (!need || need.test(m[0]))) return xmlText(v).trim()
  }
  return ''
}
const httpUrl = (u: string) => (u.length <= 2000 && /^https?:\/\/[^\s]+$/i.test(u) ? u : null)
const httpsUrl = (u: string) => (/^https:\/\//i.test(u) ? httpUrl(u) : null) // pictures load inside the app, which shows https only

/** Null when the text is not an RSS document at all (the source failed); an empty list is a valid quiet answer. */
export function parseRss(xml: unknown): Entry[] | null {
  if (typeof xml !== 'string' || !/<(rss|channel)[\s>]/i.test(xml)) return null
  const out: Entry[] = []
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0]
    const url = httpUrl(tag(b, 'link')) ?? httpUrl(tag(b, 'guid'))
    const t = Date.parse(tag(b, 'pubDate') || tag(b, 'dc:date'))
    const image = httpsUrl(attr(b, 'media:content', 'url', /medium="image"|type="image|\.(jpe?g|png|webp)/i) || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url', /type="image/i))
    const pt = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/.exec(tag(b, 'georss:point'))
    const lat = tag(b, 'geo:lat') !== '' ? Number(tag(b, 'geo:lat')) : pt ? Number(pt[1]) : NaN
    const lon = tag(b, 'geo:long') !== '' ? Number(tag(b, 'geo:long')) : pt ? Number(pt[2]) : NaN
    if (url && !Number.isNaN(t)) {
      const e: Entry = { title: cleanTitle(tag(b, 'title')), url, at: new Date(t).toISOString(), source: cleanTitle(tag(b, 'source')).slice(0, 100), image }
      if (Number.isFinite(lat) && Number.isFinite(lon)) { e.lat = lat; e.lon = lon }
      const country = cleanTitle(tag(b, 'gdacs:country'))
      if (country) e.country = country
      const desc = cleanTitle(tag(b, 'description')).slice(0, 300)
      if (desc) e.desc = desc
      out.push(e)
    }
  }
  return out
}

async function idOf(url: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)))
  return `rss-${Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Google News titles end with " - Outlet"; the outlet is already the source. */
const stripOutlet = (title: string, source: string) => (source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title)

/** One feed's entries -> the rows it feeds. Drops: no title, a date over 1 h ahead, older than the keep window, a link already seen in that table,
 *  and by relevance (rules.ts): world rows must concern the Philippines, GDACS events must be near it, health and wellbeing items must not be showbiz or crime clickbait. Newest 15 of what is left. */
export async function rowsFor(feed: Feed, entries: Entry[], now: number, seen: { world: Set<string>; items: Set<string> }): Promise<{ world: WorldRow[]; items: ItemRow[] }> {
  const world: WorldRow[] = [], items: ItemRow[] = []
  const fresh = entries.filter((x) => x.title && Date.parse(x.at) <= now + 3_600_000 && Date.parse(x.at) >= now - KEEP_DAYS * 86_400_000)
  const clean = feed.topic === 'health' || feed.topic === 'wellbeing'
  for (const e of fresh.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    if (world.length >= MAX_PER_FEED && items.length >= MAX_PER_FEED) break
    const id = await idOf(e.url)
    const source = e.source || feed.source
    const title = stripOutlet(e.title, e.source)
    if (feed.world && world.length < MAX_PER_FEED && !seen.world.has(id) && phImpact(title)) { seen.world.add(id); world.push({ id, title, url: e.url, source_domain: source, seen_at: e.at, lang: 'en', theme: 'world' }) }
    if (feed.topic && items.length < MAX_PER_FEED && !seen.items.has(id) && !(feed.geo && !gdacsKeep({ title, desc: e.desc, lat: e.lat, lon: e.lon, country: e.country })) && !(clean && isClickbait(title)) && !(feed.topic === 'wellbeing' && !isWellbeingStory(title))) {
      seen.items.add(id)
      items.push({ id, title, url: e.url, source, kind: 'article', published_at: e.at, topic: feed.topic, image_url: feed.noImage ? null : e.image, ...(feed.zone ? { zone: feed.zone } : {}) })
    }
  }
  return { world, items }
}

export interface Port {
  upsertWorld(rows: WorldRow[]): Promise<void>
  upsertItems(rows: ItemRow[]): Promise<void>
  /** Deletes this function's rows before this ISO time: world_news by seen_at, news_items with an rss- id by published_at. */
  purge(beforeIso: string): Promise<void>
}
export type Result = { ok: boolean; rows: number; items: number; queries_ok: number; queries_failed: number }

export async function runNews(port: Port, fetchText: (url: string) => Promise<string>, now: number, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), clock: () => number = Date.now): Promise<Result> {
  const seen = { world: new Set<string>(), items: new Set<string>() }
  const world: WorldRow[] = [], items: ItemRow[] = []
  const started = clock()
  let ok = 0, failed = 0
  for (const [i, feed] of FEEDS.entries()) {
    if (clock() - started > BUDGET_MS) { failed++; continue }
    if (i > 0) await sleep(GAP_MS)
    try {
      const entries = parseRss(await fetchText(feed.url))
      if (entries === null) { failed++; continue }
      ok++
      const r = await rowsFor(feed, entries, now, seen)
      world.push(...r.world); items.push(...r.items)
    } catch { failed++ }
  }
  if (world.length) await port.upsertWorld(world)
  if (items.length) await port.upsertItems(items)
  if (ok > 0) await port.purge(new Date(now - KEEP_DAYS * 86_400_000).toISOString()) // only after a good read, so dead feeds do not empty the tables early
  return { ok: ok > 0, rows: world.length, items: items.length, queries_ok: ok, queries_failed: failed }
}
