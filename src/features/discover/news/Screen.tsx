import { useEffect, useState } from 'react'
import { db } from '../../../db'
import { Icon } from '../../shell/Icon'
import { pickLocalSet } from '../../location/geo'
import { usePlace } from '../../location/useLocation'
import type { RefreshDetail } from '../../look/refresh'
import { isNoise, safeUrl, sentenceCase, type NewsItem } from '../../safety/news'
import '../play/play.css'

type Env = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }
interface Saved { savedAt: number; zone: string | null; items: NewsItem[] }
const CACHE = 'discover.news'
export const CACHE_DAYS = 7
export const CACHE_MAX_BYTES = 2 * 1024 * 1024
const SHOWN = 30

/** Official sources, matched on the source name only (a headline that mentions DOH is not an advisory). */
const OFFICIAL = /\b(pagasa|phivolcs|ndrrmc|doh|ocd)\b/i
export const isOfficial = (n: Pick<NewsItem, 'source'>): boolean => OFFICIAL.test(n.source)
/** Official advisories first, then the rest; each group keeps its newest-first order. */
export const pinFirst = (rows: NewsItem[]): { pinned: NewsItem[]; rest: NewsItem[] } => ({ pinned: rows.filter(isOfficial), rest: rows.filter((n) => !isOfficial(n)) })

/** Newest rows that fit in `max` bytes of JSON (rows arrive newest first, so the oldest are dropped). */
export function capBytes(rows: NewsItem[], max: number = CACHE_MAX_BYTES): NewsItem[] {
  const out = [...rows]
  while (out.length && new TextEncoder().encode(JSON.stringify(out)).length > max) out.pop()
  return out
}
const mine = (n: NewsItem, zone: string | null) => n.zone == null || n.zone === zone
const tidy = (rows: NewsItem[], zone: string | null) => rows.filter((n) => safeUrl(n.url) && !isNoise(n) && mine(n, zone)).slice(0, SHOWN).map((n) => ({ ...n, title: sentenceCase(n.title) }))

/** Headlines for my zone from the same `news_items` table Safety reads (filled by ops/n8n/news-feed.json). Saved for 7 days, at most 2 MB.
 *  Offline or failing: the saved list (`offline: true`) while it is under 7 days old, else an empty list. `items: null` = not configured and nothing saved. */
export async function loadFeed(zone: string | null, now: number = Date.now(), f: typeof fetch = fetch, env: Env = import.meta.env as Env): Promise<{ items: NewsItem[] | null; savedAt: number | null; offline: boolean }> {
  const saved = async () => {
    const s = (await db.kv.get(CACHE).catch(() => undefined))?.value as Saved | undefined
    if (!s || now - s.savedAt > CACHE_DAYS * 86_400_000) return null
    return s
  }
  const base = env.VITE_SUPABASE_URL
  try {
    if (!base) throw new Error('not configured')
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    const h = { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    const q = (cols: string, filter: string) => `${base}/rest/v1/news_items?select=${cols}${filter}&order=published_at.desc&limit=40`
    let res = await f(q('id,title,url,source,kind,published_at,zone', zone ? `&or=(zone.is.null,zone.eq.${encodeURIComponent(zone)})` : '&zone=is.null'), h)
    if (!res.ok && res.status >= 400 && res.status < 500) res = await f(q('id,title,url,source,kind,published_at', ''), h) // zone column not live yet
    if (!res.ok) throw new Error(String(res.status))
    const items = capBytes(tidy((await res.json()) as NewsItem[], zone))
    await db.kv.put({ key: CACHE, value: { savedAt: now, zone, items } satisfies Saved }).catch(() => undefined)
    return { items, savedAt: now, offline: false }
  } catch {
    const s = await saved()
    if (s) return { items: s.items.filter((n) => mine(n, zone)), savedAt: s.savedAt, offline: true }
    return { items: base ? [] : null, savedAt: null, offline: true }
  }
}

/** "1 h ago", "25 min ago", or the date for anything over a day. */
export function ago(iso: string, now: number): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (!(min >= 0)) return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.floor(min / 60)} h ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}
const clock = (t: number) => new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

const OFFICIAL_LINKS = [
  { name: 'PAGASA severe weather bulletin', url: 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin' },
  { name: 'PHIVOLCS earthquake and volcano bulletins', url: 'https://www.phivolcs.dost.gov.ph/' }
]

/** The list itself, for a zone. Official advisories are pinned on top; with none in the feed, links to the PAGASA and PHIVOLCS pages stand in. Headline, source and link only: no article text is kept. */
export function NewsList({ zone, now = Date.now() }: { zone: string | null; now?: number }) {
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof loadFeed>> | undefined>(undefined)
  useEffect(() => {
    let live = true
    const load = () => loadFeed(zone).then((r) => { if (live) setFeed(r) })
    void load()
    const onRefresh = (e: Event) => (e as CustomEvent<RefreshDetail>).detail.waitUntil(load()) // pull-to-refresh contract (look/refresh.ts)
    window.addEventListener('bantay:refresh', onRefresh)
    return () => { live = false; window.removeEventListener('bantay:refresh', onRefresh) }
  }, [zone])
  if (feed === undefined) return <p className="fp-note" role="status">Loading headlines</p>
  const { pinned, rest } = pinFirst(feed.items ?? [])
  return (
    <div className="fp" data-testid="news">
      <div className="fp-band" role="status">
        <Icon name={feed.offline ? 'off' : 'cloud'} size={18} />
        <span>{feed.savedAt ? `${feed.offline ? 'Headlines saved' : 'Headlines updated'} ${clock(feed.savedAt)}. New ones when there is signal.` : 'No headlines saved yet. They load when you have signal.'}</span>
      </div>
      <section className="fp-pin" aria-label="Official advisories">
        <span className="sh-sub">Official advisories (pinned)</span>
        {pinned.length
          ? pinned.map((n) => <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"><Icon name="cloud" /><span className="sh-grow"><b>{n.title}</b><span className="sh-sub" style={{ display: 'block' }}>{n.source}, {ago(n.published_at, now)}</span></span><Icon name="out" size={18} /></a>)
          : OFFICIAL_LINKS.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"><Icon name="cloud" /><span className="sh-grow"><b>{l.name}</b><span className="sh-sub" style={{ display: 'block' }}>Official source</span></span><Icon name="out" size={18} /></a>)}
      </section>
      <div className="fp-list">
        {rest.map((n) => (
          <a key={n.id} className="fp-hl" href={n.url} target="_blank" rel="noopener noreferrer">
            <b>{n.title}</b>
            <span className="fp-meta"><span>{n.kind === 'video' ? 'Video, ' : ''}{n.source}</span><span>·</span><span>{ago(n.published_at, now)}</span><span className="fp-open">Open <Icon name="out" size={16} /></span></span>
          </a>
        ))}
        {!rest.length && <p className="fp-note">{feed.items === null ? 'The news feed is not connected yet.' : 'No other headlines to show yet.'}</p>}
      </div>
      <div className="fp-src"><Icon name="info" size={18} /><span>Headline, link and source name only. No article text is kept. Open goes to the news site.</span></div>
    </div>
  )
}

/** Discover > News. The zone is the hotline area id the n8n feed tags items with (same rule as Safety's news list). */
export default function NewsScreen() {
  const place = usePlace()
  if (!place) return null
  const set = pickLocalSet(place.weather)
  return <NewsList zone={set.where === 'area' ? set.area.id : null} />
}
