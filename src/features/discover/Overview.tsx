import { useEffect, useState, type ReactNode } from 'react'
import { EmptyState, GroupedList, LargeTitle, PreviewTile, Row, Section } from '../look'
import type { RefreshDetail } from '../look/refresh'
import { useKv } from '../shell/useKv'
import { MEDCARDS, RECIPES } from './learn/data'
import { MEDCARDS_FLAG } from './learn/Screen'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import { SeasonRow } from './today/Cards'
import { featured } from './today/featured'
import { loadFeed, pinFirst, useNewsZone } from './news/Screen'
import { WATCH_PICK } from './watch/Screen'
import { playable, VIDEOS, type Video } from '../health/library/videosLogic'
import './play/play.css' // the fp-hl headline markup is the News screen's own
import './discover.css'

/** A still picture (i.ytimg.com, no cookies, no referrer), the same one Watch's poster row loads. If it cannot load it hides itself and the tile keeps its text. */
function Thumb({ id }: { id: string }) {
  const [off, setOff] = useState(false)
  if (off) return null
  return (
    <span className="dc-thumb">
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />
    </span>
  )
}

/** The latest two non-official headlines from the real news_items feed (the same loader as the News tab). */
function NewsPreview() {
  const zone = useNewsZone()
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof loadFeed>> | undefined>(undefined)
  useEffect(() => {
    if (zone === undefined) return
    let live = true
    const load = () => loadFeed(zone).then((r) => { if (live) setFeed(r) })
    void load()
    const onRefresh = (e: Event) => (e as CustomEvent<RefreshDetail>).detail.waitUntil(load()) // pull-to-refresh contract (look/refresh.ts)
    window.addEventListener('bantay:refresh', onRefresh)
    return () => { live = false; window.removeEventListener('bantay:refresh', onRefresh) }
  }, [zone])
  if (!feed) return <p className="sub" role="status">Loading headlines</p>
  const top = pinFirst(feed.items ?? []).rest.slice(0, 2)
  if (!top.length) return <p className="sub">{feed.items === null ? 'The news feed is not connected yet.' : 'No headlines saved yet. They load when you have signal.'}</p>
  return (
    <div className="fp-hls">
      {top.map((n) => (
        <a key={n.id} className="fp-hl" href={n.url} target="_blank" rel="noopener noreferrer">
          <b>{n.title}<span className="dc-sr"> (opens the news site)</span></b>
          <span className="fp-meta"><span>{n.source}</span></span>
        </a>
      ))}
    </div>
  )
}

/** The anchor keeps its href (keyboard, middle-click); the click bubbles here and hands the video to Watch. */
const Pick = ({ id, children }: { id: string; children: ReactNode }) => (
  <span className="dc-pick" onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; try { sessionStorage.setItem(WATCH_PICK, id) } catch { /* private mode */ } }}>{children}</span>
)

/** #discover (v13): large title, the video of the day, two more videos, then the season row. */
export default function Overview({ now = new Date() }: { now?: Date }) {
  const vids = VIDEOS.filter(playable)
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const { hero, more } = featured<Video>(now, vids)
  return (
    <>
      <LargeTitle testId="dc-head" kicker="Learn, watch, play" title="Discover" />
      <div data-hero data-testid="dc-hero">
        {hero
          ? <Pick id={hero.id}><PreviewTile kicker={`Watch · ${vids.length} checked videos`} tint="blue" value={hero.title} valueSize="md" sub="Plays in privacy mode after you tap" action="Watch" href="#discover/watch" media={<Thumb id={hero.id} />} /></Pick>
          : <EmptyState icon="play" title="No checked videos yet" />}
      </div>
      {more.length > 0 && (
        <div className="pt-grid" data-testid="dc-videos">
          {more.map((v, i) => <Pick key={v.id} id={v.id}><PreviewTile kicker={v.topic} tint={i ? 'purple' : 'teal'} value={v.title} valueSize="md" action="Watch" href="#discover/watch" media={<Thumb id={v.id} />} /></Pick>)}
        </div>
      )}
      <SeasonRow now={now} />
      <Section title="Learn" link={{ href: '#discover/learn', label: 'All topics' }} testId="dc-learn">
        <GroupedList icons>
          {medcards && <Row icon="pill" tint="green" title="Medicines" sub="What each medicine is for" href="#discover/learn/meds" />}
          <Row icon="meal" tint="amber" title="Recipes" sub={`${RECIPES.length} low-salt recipes`} href="#discover/learn/recipes" />
          <Row icon="file" tint="purple" title="Topics" sub="Plain reads on health topics" href="#discover/learn/library" />
        </GroupedList>
      </Section>
      <Section title="Listen" link={{ href: '#discover/listen', label: 'See all' }} testId="dc-listen">
        <p className="sub dc-lead">Read aloud by your phone</p>
        <GroupedList icons>
          <Row icon="mic" tint="teal" title="Recipes" sub={`${RECIPES.length} read out loud`} href="#discover/listen" />
          {medcards && <Row icon="mic" tint="teal" title="Medicine cards" sub={`${MEDCARDS.length} read out loud`} href="#discover/listen" />}
        </GroupedList>
      </Section>
      <Section title="Play" link={{ href: '#discover/play', label: 'All games' }} testId="dc-play">
        <div className="pt-grid">
          <PreviewTile kicker="Game" tint="blue" value="Memory" valueSize="md" sub="Match the pairs" action="Play" href="#discover/play/memory" />
          <PreviewTile kicker="Game" tint="red" value="Word search" valueSize="md" sub="Find the hidden words" action="Play" href="#discover/play/wordsearch" />
        </div>
      </Section>
      <PreviewTile kicker="Did you know?" tint="green" value={phFactOf(dayKey(now))} valueSize="md" action="More fun facts" href="#discover/play/facts" testId="dc-fact" />
      <Section title="News" link={{ href: '#discover/news', label: 'See all' }} testId="dc-news">
        <NewsPreview />
      </Section>
    </>
  )
}
