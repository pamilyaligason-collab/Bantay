import { db } from '../../db'

export interface NewsItem { id: string; title: string; url: string; source: string; kind: 'article' | 'video'; published_at: string }

const CACHE = 'safety.news'

export const safeUrl = (u: string) => /^https?:\/\//i.test(u)

type Env = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }

/** Newest 5 from the Supabase news_items table (filled by ops/n8n/news-feed.json).
 *  null = not configured. Falls back to the last saved list when offline. */
export async function loadNews(env: Env = import.meta.env as Env, f: typeof fetch = fetch): Promise<NewsItem[] | null> {
  const base = env.VITE_SUPABASE_URL
  if (!base) return null
  try {
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    const res = await f(`${base}/rest/v1/news_items?select=id,title,url,source,kind,published_at&order=published_at.desc&limit=5`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(String(res.status))
    const rows = ((await res.json()) as NewsItem[]).filter((n) => safeUrl(n.url)).slice(0, 5)
    await db.kv.put({ key: CACHE, value: rows })
    return rows
  } catch {
    return ((await db.kv.get(CACHE))?.value as NewsItem[] | undefined) ?? []
  }
}
