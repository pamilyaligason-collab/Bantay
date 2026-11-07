import { useEffect, useState } from 'react'
import type { RefreshDetail } from '../../look/refresh'
import { Icon } from '../../shell/Icon'
import { LatestRow, LeadCard, StoryRow } from './Cards'
import { freshLine, isStale, latestFirst, STALE_NOTE, topicOf, topStories, TOPIC_LABEL, type NewsRow, type NewsTopic } from './model'
import { useSaved } from './saved'
import { loadFeed, OFFICIAL_LINKS } from './Screen'

export type Chip = 'top' | 'latest' | NewsTopic
export const CHIPS: { id: Chip; label: string }[] = [
  { id: 'top', label: 'Top' }, { id: 'latest', label: 'Latest' },
  { id: 'prepping', label: TOPIC_LABEL.prepping }, { id: 'health', label: TOPIC_LABEL.health }, { id: 'national', label: TOPIC_LABEL.national }, { id: 'wellbeing', label: TOPIC_LABEL.wellbeing }
]

/** The feed for a zone, reloaded on pull-to-refresh (look/refresh.ts). */
export function useFeed(zone: string | null) {
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof loadFeed>> | undefined>(undefined)
  useEffect(() => {
    let live = true
    const load = () => loadFeed(zone).then((r) => { if (live) setFeed(r) })
    void load()
    const onRefresh = (e: Event) => (e as CustomEvent<RefreshDetail>).detail.waitUntil(load())
    window.addEventListener('bantay:refresh', onRefresh)
    return () => { live = false; window.removeEventListener('bantay:refresh', onRefresh) }
  }, [zone])
  return feed
}

/** What a chip shows: Top and Latest are the two orderings of everything; a topic chip is that topic, newest first. */
export const forChip = (rows: NewsRow[], chip: Chip): NewsRow[] => chip === 'top' ? topStories(rows) : chip === 'latest' ? latestFirst(rows) : latestFirst(rows.filter((n) => topicOf(n) === chip))

/** Which story goes where; a story shows once on the screen: Top and topic chips give the lead card, then up to three Top stories, then the rest under Latest. The Latest chip is the plain newest-first list (no lead card, so every row keeps its Read later button). */
export function layout(rows: NewsRow[], chip: Chip): { lead: NewsRow | undefined; stories: NewsRow[]; latest: NewsRow[] } {
  const shown = forChip(rows, chip)
  if (chip === 'latest') return { lead: undefined, stories: [], latest: shown }
  const lead = shown[0], stories = shown.slice(1, 4)
  const used = new Set([lead, ...stories].map((n) => n?.id))
  return { lead, stories, latest: (chip === 'top' ? latestFirst(rows) : shown).filter((n) => !used.has(n.id)) }
}

/** Discover > News (board S22News): chips, a lead image card, Top stories with the picture on the right, Latest with Read later. */
export default function NewsView({ zone, now = Date.now() }: { zone: string | null; now?: number }) {
  const feed = useFeed(zone)
  const [chip, setChip] = useState<Chip>('top')
  const saved = useSaved()
  if (feed === undefined) return <p className="fp-note" role="status">Loading headlines</p>
  const rows = feed.items ?? []
  const { lead, stories, latest } = layout(rows, chip)
  const label = CHIPS.find((c) => c.id === chip)!.label
  return (
    <div className="nw" data-testid="news">
      <div className="nw-chips" role="group" aria-label="News topics">
        {CHIPS.map((c) => <button key={c.id} type="button" className="nw-chip" aria-pressed={c.id === chip} onClick={() => setChip(c.id)}>{c.label}</button>)}
      </div>
      <div className="fp-band" role="status">
        <Icon name={feed.offline ? 'off' : 'cloud'} size={18} />
        <span>{freshLine(rows, now, feed.offline)}</span>
      </div>
      {isStale(rows, now) && <p className="fp-note nw-stale" role="status">{STALE_NOTE}</p>}
      {!lead && !latest.length && <p className="fp-note">{feed.items === null ? 'The news feed is not connected yet.' : chip === 'top' || chip === 'latest' ? 'No headlines to show yet.' : `No ${label.toLowerCase()} stories yet.`}</p>}
      {lead && <LeadCard n={lead} now={now} testId="nw-lead" />}
      {stories.length > 0 && <section aria-label="Top stories"><h2 className="nw-h">Top stories</h2>{stories.map((n) => <StoryRow key={n.id} n={n} now={now} />)}</section>}
      {latest.length > 0 && <section aria-label="Latest"><h2 className="nw-h">Latest</h2>{latest.map((n) => <LatestRow key={n.id} n={n} now={now} saved={saved.some((s) => s.id === n.id)} />)}</section>}
      <section aria-label="Official bulletins"><h2 className="nw-h">Official bulletins</h2>
        {OFFICIAL_LINKS.map((l) => <a key={l.url} className="nw-item nw-off" href={l.url} target="_blank" rel="noopener noreferrer"><span className="nw-body"><b className="nw-title">{l.name}<span className="dc-sr"> (opens the official site)</span></b></span><Icon name="out" size={18} /></a>)}
      </section>
      <div className="fp-src"><Icon name="info" size={18} /><span>Headline, picture, link and source name only. No article text is kept. Pictures load from the news site when you have signal.</span></div>
    </div>
  )
}
