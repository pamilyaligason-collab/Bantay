import { db } from '../../db'

export interface NewsItem { id: string; title: string; url: string; source: string; kind: 'article' | 'video'; published_at: string }

const CACHE = 'safety.news'

export const safeUrl = (u: string) => /^https?:\/\//i.test(u)

/** Same filter as the n8n news workflow (no tender numbers, no procurement notices), plus job vacancies, tourism promotion and veterinary items: Safety news is warnings and advisories only. */
const HARD = /invitation to bid|bid bulletin|notice of award|supply and delivery|procurement|vacanc|job opening|now hiring|we are hiring|career opportunit|plantilla/i
/** Off-topic words, kept anyway when the item names a hazard or an official warning source. */
const SOFT = /\b(tourism|tourists?|travel (tips|guide)|veterinar\w*|livestock|vets?|animal (health|welfare)|rabies vaccin\w*)\b/i
const SAFETY = /pagasa|phivolcs|ndrrmc|\bdoh\b|signal no|evacuat|flood|typhoon|storm|cyclone|quake|earthquake|volcan|landslide|tsunami|warning|advisory|outbreak/i
export const isNoise = (n: Pick<NewsItem, 'title' | 'source'>) => {
  const t = `${n.title} ${n.source}`
  return /\(\d{9,}-/.test(n.title) || HARD.test(t) || (SOFT.test(t) && !SAFETY.test(t))
}

type Env = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }

/** Newest 5 (after dropping bid notices, from the latest 40) from the Supabase news_items table (filled by ops/n8n/news-feed.json).
 *  null = not configured. Falls back to the last saved list when offline. */
export async function loadNews(env: Env = import.meta.env as Env, f: typeof fetch = fetch): Promise<NewsItem[] | null> {
  const base = env.VITE_SUPABASE_URL
  if (!base) return null
  try {
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    const res = await f(`${base}/rest/v1/news_items?select=id,title,url,source,kind,published_at&order=published_at.desc&limit=40`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(String(res.status))
    const rows = ((await res.json()) as NewsItem[]).filter((n) => safeUrl(n.url) && !isNoise(n)).slice(0, 5)
    await db.kv.put({ key: CACHE, value: rows })
    return rows
  } catch {
    return (((await db.kv.get(CACHE))?.value as NewsItem[] | undefined) ?? []).filter((n) => !isNoise(n))
  }
}
