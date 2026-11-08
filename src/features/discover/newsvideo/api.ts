import { useEffect, useState } from 'react'
import { db } from '../../../db'
import { supabase } from '../../auth/client'

/** A news_videos row (migration 0055, D-159): a recent video from a Philippine news channel, filled by the yt-feed function every 30 minutes. */
export interface NewsVideo { video_id: string; channel_id: string; channel: string; title: string; published_at: string }
export interface NewsVideoList { rows: NewsVideo[]; fetchedAt: number }
interface Saved { savedAt: number; fetchedAt: number; rows: NewsVideo[] }
export const NEWS_DAYS = 3 // the server keeps 3 days; so does the saved copy
const CACHE = (channel?: string) => 'discover.newsvideo.' + (channel ?? 'all')

/** The channels the chips filter by (ids as in the yt-feed function). */
export const NEWS_CHANNELS: { id: string; label: string }[] = [
  { id: 'UCqYw-CTd1dU2yGI71sEyqNw', label: 'GMA News' },
  { id: 'UCE2606prvXQc_noEqKxVJXA', label: 'ABS-CBN News' },
  { id: 'UCiXhD6IScRs5r-tDvVvKjSA', label: 'Bilyonaryo' },
  { id: 'UCj5RwDivLksanrNvkW0FB4w', label: 'GMA Public Affairs' }
]

const valid = (r: unknown): r is NewsVideo => {
  const o = (r ?? {}) as Record<string, unknown>
  return typeof o.video_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(o.video_id) && typeof o.channel_id === 'string' && typeof o.channel === 'string' && typeof o.title === 'string' && !!o.title
    && typeof o.published_at === 'string' && Number.isFinite(Date.parse(o.published_at))
}

/** Reads the newest rows (signed-in read), saves them, and falls back to the saved copy while it is under 3 days old. null = nothing known (not connected, table not there yet, offline with nothing saved). */
export async function loadNewsVideos(channel?: string, now: number = Date.now()): Promise<NewsVideoList | null> {
  const saved = async (): Promise<NewsVideoList | null> => {
    const get = async (c?: string) => (await db.kv.get(CACHE(c)).catch(() => undefined))?.value as Saved | undefined
    // A channel never opened while online has no copy of its own: its videos are in the "all" copy.
    const s = (await get(channel)) ?? (channel ? await get() : undefined)
    return s && Array.isArray(s.rows) && now - s.savedAt <= NEWS_DAYS * 86_400_000 ? { rows: s.rows.filter((r) => valid(r) && (!channel || r.channel_id === channel)), fetchedAt: s.fetchedAt } : null
  }
  try {
    if (!supabase) throw new Error('not_connected')
    let q = supabase.from('news_videos').select('video_id,channel_id,channel,title,published_at,fetched_at').order('published_at', { ascending: false }).limit(24)
    if (channel) q = q.eq('channel_id', channel)
    const { data, error } = await q
    if (error) throw new Error('read')
    const list = (data ?? []) as (NewsVideo & { fetched_at?: string })[]
    const rows = list.filter(valid)
    // The newest fetched_at is when the server last looked; an empty table has no such time, so it shows "now" only once it has rows.
    const fetchedAt = list.reduce((m, r) => Math.max(m, Date.parse(r.fetched_at ?? '') || 0), 0) || now
    await db.kv.put({ key: CACHE(channel), value: { savedAt: now, fetchedAt, rows } satisfies Saved }).catch(() => undefined)
    return { rows, fetchedAt }
  } catch {
    return await saved()
  }
}

/** useNewsVideos(channel?): { rows, fetchedAt } newest first (at most 24), or null until the first read settles or when nothing is known. An empty list is a quiet table. */
export function useNewsVideos(channel?: string): NewsVideoList | null {
  const [state, setState] = useState<{ channel?: string; list: NewsVideoList | null }>({ channel, list: null })
  useEffect(() => {
    let live = true
    void loadNewsVideos(channel).then((l) => { if (live) setState({ channel, list: l }) }, () => undefined)
    return () => { live = false }
  }, [channel])
  return state.channel === channel ? state.list : null
}

/** "NEW · 40 MIN" under an hour, then "3 HR", then "2 DAYS": a short badge for the card. */
export function ageBadge(publishedAt: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(publishedAt)) / 60_000))
  if (mins < 60) return `NEW · ${Math.max(1, mins)} MIN`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} HR`
  const days = Math.floor(hrs / 24)
  return `${days} ${days === 1 ? 'DAY' : 'DAYS'}`
}

/** "Updated 12 min ago" for the section heading. */
export function updatedLine(fetchedAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - fetchedAt) / 60_000))
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return hrs < 24 ? `Updated ${hrs} hr ago` : `Updated ${Math.floor(hrs / 24)} d ago`
}
