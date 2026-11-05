import { useEffect, useState, type ReactNode } from 'react'
import { Carousel, EmptyState, GroupedList, JackArt, LargeTitle, PreviewTile, Row, Section } from '../look'
import { HeadActions } from '../shell/HeadActions'
import type { RefreshDetail } from '../look/refresh'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { RECIPES } from './learn/data'
import { MEDCARDS_FLAG } from './learn/Screen'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import { SeasonRow } from './today/Cards'
import { featured } from './today/featured'
import { loadFeed, pinFirst, useNewsZone } from './news/Screen'
import { WATCH_PICK } from './watch/Screen'
import { canSpeak } from './listen/speech'
import { useReadAloud } from './listen/useReadAloud'
import { playable, type Video } from '../health/library/videosLogic'
import { DISCOVER_VIDEOS, READY_TOPICS, READY_VIDEOS, countLine } from './learn/ready'
import './play/play.css' // the fp-hl headline markup is the News screen's own
import './discover.css'

/** A still picture (i.ytimg.com, no cookies, no referrer), the same one Watch's poster row loads. If it cannot load it hides itself and the tile keeps its text. */
function Thumb({ id }: { id: string }) {
  const [off, setOff] = useState(false)
  if (off) return null
  return (
    <span className="dc-still">
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

/** A full-width tinted Learn card per the board: icon tile, title, one line, chevron. */
const LearnCard = (p: { tint: 'green' | 'amber' | 'purple'; icon: 'pill' | 'meal' | 'file'; title: string; sub: string; href: string; testId: string }) => (
  <div className="card dc-lcard" data-tint={p.tint}><Row icon={p.icon} tint={p.tint} title={p.title} sub={p.sub} href={p.href} testId={p.testId} /></div>
)

const minutes = (v: Video) => (v.minutes ? ` · ${v.minutes} min` : '')

/** Read-aloud rows: the first three items of the Listen list, each with its own 44 px play button. */
function ListenRows() {
  const { items, playing, toggle } = useReadAloud()
  if (!canSpeak()) return <p className="sub dc-lead">Reading aloud is not on this phone yet.</p>
  return (
    <>
      <p className="sub dc-lead">Read aloud by your phone</p>
      <GroupedList icons>
        {items.slice(0, 3).map((it) => {
          const on = playing === it.id
          return (
            <Row key={it.id} icon="mic" tint="teal" title={it.title} sub={it.sub} href="#discover/listen" testId={`dc-listen-${it.id}`}
              control={<button type="button" className="sh-iconbtn dc-play" aria-pressed={on} aria-label={`${on ? 'Stop' : 'Play'} ${it.title}`} onClick={() => void toggle(it.id)}><Icon name={on ? 'pause' : 'play'} size={20} /></button>} />
          )
        })}
      </GroupedList>
    </>
  )
}

/** #discover (v13): large title, the video of the day, two more videos, then the season row. */
export default function Overview({ now = new Date() }: { now?: Date }) {
  const vids = DISCOVER_VIDEOS.filter(playable)
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const { hero, more } = featured<Video>(now, vids)
  const prepTopic = READY_TOPICS.find((t) => t.id === 'prepping')?.video
  const shown = new Set([hero?.id, ...more.map((v) => v.id)])
  const prep = READY_VIDEOS.filter((v) => v.topic === prepTopic && playable(v)).sort((a, b) => Number(shown.has(a.id)) - Number(shown.has(b.id))).slice(0, 3) // up to three checked prepping videos, ones not already above first
  return (
    <>
      <LargeTitle testId="dc-head" kicker="Learn, watch, play" title="Discover" actions={<HeadActions><a className="sh-iconbtn dc-search" href="#discover/learn/library" aria-label="Search health topics" data-testid="dc-search"><Icon name="search" size={22} /></a></HeadActions>} />
      <div className="dc-top">
      <div data-hero data-testid="dc-hero">
        {hero
          ? (
            <Pick id={hero.id}>
              <a className="card dc-herocard" href="#discover/watch">
                <span className="dc-poster-box">
                  <Thumb id={hero.id} />
                  <span className="dc-hchip">Watch · {vids.length} checked videos</span>
                  <span className="dc-hero-play" aria-hidden="true"><Icon name="play" size={28} /></span>
                </span>
                <span className="dc-hero-body">
                  <span className="dc-hero-k">{hero.topic}{minutes(hero)}</span>
                  <span className="dc-hero-t">{hero.title}</span>
                  <span className="dc-hero-s">Plays in privacy mode after you tap</span>
                </span>
              </a>
            </Pick>
          )
          : <EmptyState icon="play" title="No checked videos yet" />}
      </div>
      {more.length > 0 && (
        <div className="pt-grid" data-testid="dc-videos">
          {more.map((v, i) => (
            <Pick key={v.id} id={v.id}>
              <a className="card dc-vc" href="#discover/watch" data-tint={i ? 'purple' : 'teal'}>
                <span className="dc-vc-pic"><Thumb id={v.id} /><span className="dc-vc-play" aria-hidden="true"><Icon name="play" size={18} /></span></span>
                <span className="dc-vc-body"><span className="dc-vc-k">{v.topic}</span><span className="dc-vc-t">{v.title}</span></span>
              </a>
            </Pick>
          ))}
        </div>
      )}
      <SeasonRow now={now} />
      </div>
      {prep.length > 0 && (
        <Section title="Be prepared" link={{ href: '#discover/learn/prepping', label: 'See all' }} testId="dc-prep-row">
          <Carousel label="Be prepared videos">
            {prep.map((v) => (
              <Pick key={v.id} id={v.id}>
                <a className="card dc-vc dc-prep" href="#discover/watch" data-tint="teal">
                  <span className="dc-vc-pic"><Thumb id={v.id} /><span className="dc-vc-play" aria-hidden="true"><Icon name="play" size={18} /></span></span>
                  <span className="dc-vc-body"><span className="dc-vc-t">{v.title}</span></span>
                </a>
              </Pick>
            ))}
          </Carousel>
        </Section>
      )}
      <Section title="Learn" link={{ href: '#discover/learn', label: 'All topics' }} testId="dc-learn">
        <div className="dc-lcards">
          {medcards && <LearnCard tint="green" icon="pill" title="Medicines" sub="What each medicine is for" href="#discover/learn/meds" testId="dc-learn-meds" />}
          <LearnCard tint="amber" icon="meal" title="Recipes" sub={`${RECIPES.length} low-salt recipes`} href="#discover/learn/recipes" testId="dc-learn-recipes" />
          <LearnCard tint="purple" icon="file" title="Topics" sub="Plain reads on health topics" href="#discover/learn/library" testId="dc-learn-topics" />
        </div>
      </Section>
      <Section title="Listen" link={{ href: '#discover/listen', label: 'See all' }} testId="dc-listen">
        <ListenRows />
      </Section>
      <Section title="Ready at home" testId="dc-ready">
        <p className="sub dc-lead">Checked videos and reads, calm and practical</p>
        <GroupedList icons>
          {READY_TOPICS.map((t) => (
            <Row key={t.id} icon={t.id === 'prepping' ? 'bag' : 'home'} tint={t.id === 'prepping' ? 'green' : 'amber'} title={t.title} sub={countLine(t)} href={'#discover/learn/' + t.id} testId={'dc-ready-' + t.id} />
          ))}
        </GroupedList>
      </Section>
      <Section title="Play" link={{ href: '#discover/play', label: 'All games' }} testId="dc-play">
        <div className="pt-grid">
          <PreviewTile tint="blue" value="Memory" valueSize="md" sub="Match the pairs" href="#discover/play/memory" media={<span className="dc-glyph dc-glyph-mem" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>} />
          <PreviewTile tint="red" value="Word search" valueSize="md" sub="Find the hidden words" href="#discover/play/wordsearch" media={<span className="dc-glyph dc-glyph-word" aria-hidden="true">B_NT_Y</span>} />
        </div>
      </Section>
      <a className="card dc-fact" href="#discover/play/facts" data-tint="green" data-testid="dc-fact">
        <JackArt name="thinking" size={56} decorative />
        <span className="dc-grow"><span className="dc-fact-k">Did you know?</span><span className="dc-fact-t">{phFactOf(dayKey(now))}</span></span>
      </a>
      <Section title="News" link={{ href: '#discover/news', label: 'See all' }} testId="dc-news">
        <NewsPreview />
      </Section>
    </>
  )
}
