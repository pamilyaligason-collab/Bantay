import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { parseDigest, type Digest } from './panels'

export interface NewsItem { id: string; title: string; url: string; source: string; seenAt: string }
export type NewsState = 'off' | 'loading' | 'ok' | 'error'
export interface WorldNews { state: NewsState; news: NewsItem[]; digest: Digest | null }
export type Want = { news: boolean; digest: boolean }
export type Loader = (want: Want) => Promise<{ news: unknown[] | null; digest: unknown }> // null news = that read failed

export const MAX_NEWS = 6
export const NEWS_STALE_H = 24 // the server refreshes every 6 h; older than a day means it stopped

/** Third-party text: kept as plain strings, links only if http(s), never HTML. A row without a title or a safe link is dropped. */
export function parseNews(rows: unknown): NewsItem[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r): NewsItem[] => {
    const o = (r ?? {}) as Record<string, unknown>
    const url = typeof o.url === 'string' ? o.url : ''
    const seenAt = typeof o.seen_at === 'string' && !Number.isNaN(Date.parse(o.seen_at)) ? o.seen_at : ''
    if (typeof o.id !== 'string' || typeof o.title !== 'string' || !o.title.trim() || !seenAt || !/^https?:\/\//i.test(url)) return []
    return [{ id: o.id, title: o.title.trim(), url, source: typeof o.source_domain === 'string' ? o.source_domain : '', seenAt }]
  }).sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt)).slice(0, MAX_NEWS)
}

export const newsIsOld = (news: NewsItem[], now: number) => news.length > 0 && now - Date.parse(news[0]!.seenAt) > NEWS_STALE_H * 3_600_000

const fromSupabase: Loader = async (want) => {
  if (!supabase) throw new Error('not_connected')
  const [n, d] = await Promise.all([
    want.news ? supabase.from('world_news').select('id,title,url,source_domain,seen_at').order('seen_at', { ascending: false }).limit(20) : null,
    want.digest ? supabase.from('safety_digests').select('day,body').order('day', { ascending: false }).limit(1) : null
  ])
  if (n?.error && !d?.data) throw new Error('read') // each part stands alone: a missing digest table must not hide the headlines
  return { news: n?.error ? null : n?.data ?? [], digest: d?.error ? null : d?.data?.[0] ?? null }
}

/** Reads the headlines and the latest digest only for the parts a flag turns on. A failed read leaves "error"; nothing is invented. */
export function useWorldNews(want: Want, load: Loader = fromSupabase): WorldNews {
  const [s, setS] = useState<WorldNews>({ state: want.news || want.digest ? 'loading' : 'off', news: [], digest: null })
  useEffect(() => {
    if (!want.news && !want.digest) return setS({ state: 'off', news: [], digest: null })
    let live = true
    setS((p) => ({ ...p, state: 'loading' })) // no "none yet" line while a re-read runs
    load(want).then((r) => live && setS({ state: r.news === null && want.news ? 'error' : 'ok', news: parseNews(r.news), digest: parseDigest(r.digest) }), () => live && setS({ state: 'error', news: [], digest: null }))
    return () => { live = false }
  }, [want.news, want.digest]) // eslint-disable-line react-hooks/exhaustive-deps -- load is a stable module function or a test double
  return s
}
