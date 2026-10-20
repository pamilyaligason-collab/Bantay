import { db } from '../../db'

export interface NewsItem { id: string; title: string; url: string; source: string; kind: 'article' | 'video'; published_at: string; zone?: string | null }

const CACHE = 'safety.news'

export const safeUrl = (u: string) => /^https?:\/\//i.test(u)

/** Same filter as the n8n news workflow (no tender numbers, no procurement notices), plus job vacancies, tourism promotion and veterinary items: Safety news is warnings and advisories only. */
const HARD = /invitation to bid|bid bulletin|notice of award|supply and delivery|procurement|vacanc|job opening|now hiring|we are hiring|career opportunit|plantilla/i
/** Off-topic words, kept anyway when the item names a hazard or an official warning source. */
const SOFT = /\b(tourism|tourists?|travel (tips|guide)|veterinar\w*|livestock|vets?|animal (health|welfare)|rabies vaccin\w*)\b/i
const SAFETY = /\b(pagasa|phivolcs|ndrrmc|doh|signal no|evacuat\w*|floods?|flooding|typhoon|storms?|cyclone|quake|earthquake|volcano|volcanic|landslide|tsunami|outbreak)\b/i
const OFFICIAL = /\b(pagasa|phivolcs|ndrrmc|doh|ocd|lgu)\b/i
const BARE = /\b(advisory|warning)\b/i
export const isNoise = (n: Pick<NewsItem, 'title' | 'source'>) => {
  const t = `${n.title} ${n.source}`
  return /\(\d{9,}-/.test(n.title) || HARD.test(t) || (SOFT.test(t) && !(SAFETY.test(t) || (BARE.test(t) && OFFICIAL.test(t))))
}

type Env = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }

export const NEWS_MAX = 3

/** Words that keep their own capitals when an all-caps headline is turned into a sentence. Looked up in any case. */
const KEEP_CAPS = new Map<string, string>(
  ['PAGASA', 'PHIVOLCS', 'NDRRMC', 'DOH', 'OCD', 'LGU', 'PNP', 'BFP', 'NCR', 'MMDA', 'DSWD', 'DILG', 'DepEd', 'PIA', 'US', 'USA', 'UN', 'WHO', 'TCWS', 'NGCP', 'GMA', 'ABS-CBN', 'COVID-19'].map((w) => [w.toUpperCase(), w])
)
/** Place names that keep a capital letter. */
const PLACES = new Set(['cebu', 'davao', 'manila', 'tagbilaran', 'bohol', 'santos', 'general', 'texas', 'philippines', 'luzon', 'visayas', 'mindanao', 'quezon', 'sarangani', 'cotabato', 'metro', 'mindoro', 'leyte', 'samar'])
/** The word after one of these is a storm's name ("Typhoon Paeng"). */
const STORM_LEAD = new Set(['typhoon', 'tropical storm', 'tropical depression'])
const isShout = (t: string) => /[A-Z]{3}/.test(t) && t === t.toUpperCase()
const cap = (w: string) => w.replace(/[a-z]/, (c) => c.toUpperCase())
const letters = (w: string) => w.replace(/[^a-z ]/g, '')
/** ALL CAPS headline -> sentence case ("HEAVY RAIN IN CEBU" -> "Heavy rain in Cebu"). Mixed-case titles are left alone. */
export function sentenceCase(title: string): string {
  if (!isShout(title)) return title
  const src = title.toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
  const words = src.map((w, i) => {
    const m = /^([^a-z0-9]*)([a-z0-9-]+?)(['’]s)?([^a-z0-9]*)$/.exec(w)
    if (!m) return w
    const pre = m[1] ?? '', core = m[2] ?? '', poss = m[3] ?? '', post = m[4] ?? ''
    const keep = KEEP_CAPS.get(core.toUpperCase())
    if (keep) return pre + keep + poss + post
    if (PLACES.has(core)) return pre + cap(core) + poss + post
    const lead = STORM_LEAD.has(letters(src[i - 1] ?? '')) || STORM_LEAD.has(letters(`${src[i - 2] ?? ''} ${src[i - 1] ?? ''}`))
    return lead ? pre + cap(core) + poss + post : w
  })
  return words.join(' ').replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase())
}

const mine = (n: NewsItem, zone: string | null | undefined) => n.zone == null || n.zone === zone
const tidy = (rows: NewsItem[], zone: string | null | undefined) =>
  rows.filter((n) => safeUrl(n.url) && !isNoise(n) && mine(n, zone)).slice(0, NEWS_MAX).map((n) => ({ ...n, title: sentenceCase(n.title) }))

/** Newest 3 for my zone (or for every zone: zone null) after dropping bid notices, from the latest 40 in the Supabase news_items table (filled by ops/n8n/news-feed.json).
 *  `zone` is a hotline area id such as 'davao'; no zone given (outside every area) shows only items without a zone.
 *  null = not configured. Falls back to the last saved list when offline. If the zone column is not live yet the request is retried without the filter. */
export async function loadNews(env: Env = import.meta.env as Env, f: typeof fetch = fetch, zone?: string | null): Promise<NewsItem[] | null> {
  const base = env.VITE_SUPABASE_URL
  if (!base) return null
  try {
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    const h = { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    const q = (cols: string, filter: string) => `${base}/rest/v1/news_items?select=${cols}${filter}&order=published_at.desc&limit=40`
    const filter = zone ? `&or=(zone.is.null,zone.eq.${encodeURIComponent(zone)})` : '&zone=is.null'
    let res = await f(q('id,title,url,source,kind,published_at,zone', filter), h)
    if (!res.ok && res.status >= 400 && res.status < 500) res = await f(q('id,title,url,source,kind,published_at', ''), h) // migration 0017 not applied yet
    if (!res.ok) throw new Error(String(res.status))
    const rows = tidy((await res.json()) as NewsItem[], zone)
    await db.kv.put({ key: CACHE, value: rows })
    return rows
  } catch {
    return tidy(((await db.kv.get(CACHE))?.value as NewsItem[] | undefined) ?? [], zone)
  }
}
