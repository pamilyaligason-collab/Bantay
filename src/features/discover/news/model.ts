import type { NewsItem } from '../../safety/news'

/** A news_items row. image_url and topic arrive with migration 0051: both may be missing (older server) or null. */
export interface NewsRow extends NewsItem { image_url?: string | null; topic?: string | null }
export type NewsTopic = 'prepping' | 'health' | 'national' | 'wellbeing' | 'world'
/** Top interleaves in this order, so prepping and health come first. */
export const TOPIC_ORDER: NewsTopic[] = ['prepping', 'health', 'national', 'wellbeing', 'world']
export const TOPIC_LABEL: Record<NewsTopic, string> = { prepping: 'Prepping', health: 'Health', national: 'National', wellbeing: 'Wellbeing', world: 'World' }

export const topicOf = (n: Pick<NewsRow, 'topic'>): NewsTopic | null => (TOPIC_ORDER as string[]).includes(n.topic ?? '') ? (n.topic as NewsTopic) : null
const ms = (n: NewsRow) => { const t = Date.parse(n.published_at); return Number.isFinite(t) ? t : 0 }
/** Latest = published_at, newest first (stable for equal times). */
export const latestFirst = (rows: NewsRow[]): NewsRow[] => [...rows].sort((a, b) => ms(b) - ms(a))

/** Top: the newest story of each topic (prepping, health, national, wellbeing, world), then the second newest of each, and so on. Stories with no topic follow, newest first. */
export function topStories(rows: NewsRow[]): NewsRow[] {
  const sorted = latestFirst(rows)
  const by = TOPIC_ORDER.map((t) => sorted.filter((n) => topicOf(n) === t))
  const out: NewsRow[] = []
  for (let i = 0; by.some((l) => i < l.length); i++) for (const l of by) if (i < l.length) out.push(l[i]!)
  return [...out, ...sorted.filter((n) => topicOf(n) === null)]
}

/** The mark on a source tile: first letter or digit of the name. */
export const initialOf = (source: string): string => (/[\p{L}\p{N}]/u.exec(source)?.[0] ?? '?').toUpperCase()
/** One of six dark tile colours, the same for the same source every time. */
export const hueOf = (source: string): number => { let h = 0; for (const c of source) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 6 }

/** The freshness band text, from the newest row's age (not from when the list was saved). */
export function freshLine(rows: NewsRow[], now: number, offline: boolean): string {
  const newest = latestFirst(rows)[0]
  const t = newest ? Date.parse(newest.published_at) : NaN
  if (!Number.isFinite(t)) return 'No headlines saved yet. They load when you have signal.'
  const min = Math.max(0, Math.floor((now - t) / 60_000))
  const days = Math.floor(min / 1440)
  const head = days >= 1 ? `Newest headline ${days} ${days === 1 ? 'day' : 'days'} old.` : min < 1 ? 'Updated just now.' : min < 60 ? `Updated ${min} min ago.` : `Updated ${Math.floor(min / 60)} h ago.`
  return offline ? `${head} Headlines saved. New ones when there is signal.` : head
}
