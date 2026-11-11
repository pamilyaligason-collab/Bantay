import data from '../../../data/discover/ready.json'
import { playable, VIDEO_ID, type Video } from '../../health/library/videosLogic'

/** D-117 shelf (src/data/discover/ready.json): prepping, farming and DIY, listening and recipe videos, checked links only. Kept out of VIDEOS so Today and Health stay health-only. */
export interface Read { id: string; topic: string; title: string; source: string; url: string; checked: string }
/** Every shelf in ready.json; READY_TOPICS (the Learn topic tiles) is the two that also have reads and a page of their own. listen and recipes-video are Discover shelves only. */
export const READY_SHELVES = data.topics
export const READY_TOPICS = data.topics.filter((t) => t.id === 'prepping' || t.id === 'farm-diy')
export const READY_VIDEOS = data.videos as Video[]
export const READY_READS = data.reads as Read[]
/** S25 (D-155): health videos live in Health now (videos.json, by sub-topic); Discover's video cards and Watch draw from the D-117 shelf only. */
export const DISCOVER_VIDEOS: Video[] = READY_VIDEOS
export const topicCounts = (t: (typeof data.topics)[number]) => ({ videos: READY_VIDEOS.filter((v) => v.topic === t.video).length, reads: READY_READS.filter((r) => r.topic === t.id).length })
export const countLine = (t: (typeof data.topics)[number]) => { const c = topicCounts(t); return `${c.videos} videos · ${c.reads} reads` }
/** The checked videos of one ready.json shelf (by shelf id), through playable() like everywhere else they are shown. */
export const readyShelf = (id: string): Video[] => { const topic = READY_SHELVES.find((t) => t.id === id)?.video; return READY_VIDEOS.filter((v) => v.topic === topic && playable(v)) }

// ---------- S33: fresh Watch videos (watch_videos, migration 0067, filled daily by the watch-feed function) ----------
/** A video on a Watch shelf; `fresh` marks one that came from the daily feed (the card says "New"). */
export type WatchVideo = Video & { fresh?: boolean }
/** watch_videos.shelf -> the ready.json shelf name the Watch topic chips use. */
export const FRESH_TOPIC: Record<string, string> = { prepping: 'Be prepared', 'farm-diy': 'Farming and DIY', recipes: 'Recipe videos' }
export const FRESH_DAYS = 30
export const FRESH_PER_SHELF = 10

/** Fresh rows first (newest first, at most 10 per shelf, nothing older than 30 days, only a real id on a known shelf), then the checked videos, no video twice. Anything unreadable in `fresh` is skipped; with no usable row the result is the checked list as it was.
 *  `now` is epoch ms. */
export function mergeFresh(fresh: unknown, curated: Video[], now: number = Date.now()): WatchVideo[] {
  const rows: { v: WatchVideo; t: number }[] = []
  for (const r of Array.isArray(fresh) ? (fresh as Record<string, unknown>[]) : []) {
    const o = r ?? {}
    const topic = typeof o.shelf === 'string' ? FRESH_TOPIC[o.shelf] : undefined
    const t = typeof o.published_at === 'string' ? Date.parse(o.published_at) : NaN
    if (typeof o.video_id !== 'string' || !VIDEO_ID.test(o.video_id) || !topic || typeof o.title !== 'string' || !o.title.trim() || typeof o.channel !== 'string' || !o.channel.trim()) continue
    if (!Number.isFinite(t) || now - t > FRESH_DAYS * 86_400_000 || t > now + 3_600_000) continue
    rows.push({ v: { id: o.video_id, placeholder: false, title: o.title.trim(), topic, source: o.channel.trim(), minutes: null, sub: null, fresh: true }, t })
  }
  const seen = new Set<string>()
  const per = new Map<string, number>()
  const out: WatchVideo[] = []
  for (const { v } of rows.sort((a, b) => b.t - a.t)) {
    if (seen.has(v.id)) continue
    const n = (per.get(v.topic) ?? 0) + 1
    if (n > FRESH_PER_SHELF) continue
    per.set(v.topic, n)
    seen.add(v.id)
    out.push(v)
  }
  return out.concat(curated.filter((v) => !seen.has(v.id)))
}
