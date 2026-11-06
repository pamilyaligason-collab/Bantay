import { useEffect, useState } from 'react'
import { Section } from '../look'
import { ago, loadFeed, useNewsZone } from '../discover/news/Screen'
import { NewsPic } from '../discover/news/Cards'
import { latestFirst, type NewsRow } from '../discover/news/model'
import type { RefreshDetail } from '../look/refresh'
import './todayNews.css'

const WEEK = 7 * 86_400_000
/** The 3 newest rows from the last 7 days (a row with no readable time counts as old). */
export function freshHeadlines(rows: NewsRow[], now: number): NewsRow[] {
  return latestFirst(rows).filter((n) => { const t = Date.parse(n.published_at); return Number.isFinite(t) && now - t <= WEEK }).slice(0, 3)
}

/** D-142: top headlines on Today from the feed Discover uses (loadFeed, same cache). Hidden when nothing is fresh. All news opens Discover > News. */
export default function TodayNews({ now = Date.now() }: { now?: number }) {
  const zone = useNewsZone() // undefined = place not known yet: no fetch, so Today makes one request and never caches zone-less rows over the zone's
  const [rows, setRows] = useState<NewsRow[]>([])
  useEffect(() => {
    if (zone === undefined) return
    let live = true
    const load = () => loadFeed(zone).then((r) => { if (live) setRows(r.items ?? []) }, () => undefined)
    void load()
    const onRefresh = (e: Event) => (e as CustomEvent<RefreshDetail>).detail.waitUntil(load()) // pull-to-refresh contract (look/refresh.ts), as NewsList
    window.addEventListener('bantay:refresh', onRefresh)
    return () => { live = false; window.removeEventListener('bantay:refresh', onRefresh) }
  }, [zone])
  const top = freshHeadlines(rows, now)
  if (!top.length) return null
  return (
    <Section title="News" link={{ href: '#discover/news', label: 'All news' }} testId="today-news">
      <div className="card tn">
        {top.map((n) => (
          <a key={n.id} className="tn-row press" href={n.url} target="_blank" rel="noopener noreferrer">
            <span className="tn-body">
              <span className="tn-meta">{n.source}, {ago(n.published_at, now)}</span>
              <span className="tn-title">{n.title}</span>
            </span>
            <NewsPic n={n} w={64} h={64} className="tn-img" />
          </a>
        ))}
      </div>
    </Section>
  )
}
