import { useEffect, useState } from 'react'
import { loadNews, type NewsItem } from './news'
import type { RefreshDetail } from '../look/refresh'
import './safety.css'

/** Top 5 from the news_items table. Empty state when Supabase is not configured. */
export default function NewsTop5() {
  const [items, setItems] = useState<NewsItem[] | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const load = () => loadNews().then((r) => { if (live) setItems(r) })
    load()
    // pull-to-refresh contract (src/features/look/refresh.ts)
    const onRefresh = (e: Event) => (e as CustomEvent<RefreshDetail>).detail.waitUntil(load())
    window.addEventListener('bantay:refresh', onRefresh)
    return () => { live = false; window.removeEventListener('bantay:refresh', onRefresh) }
  }, [])
  if (items === undefined) return null
  if (!items?.length)
    return <p className="sf-empty" role="status">{items === null ? 'The news feed is not connected yet.' : 'No news to show yet.'}</p>
  return (
    <div className="grp sf-news">
      {items.map((n) => (
        <a key={n.id} className="row" href={n.url} target="_blank" rel="noopener noreferrer">
          <span className="grow">
            <span style={{ fontWeight: 600 }}>{n.title}</span>
            <span className="sub" style={{ fontSize: 13 }}>{n.kind === 'video' ? 'Video, ' : ''}{n.source}, {new Date(n.published_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
