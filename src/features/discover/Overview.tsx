import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EmptyState, JackArt, LargeTitle, MoreGrid, PreviewTile, Section } from '../look'
import { HeadActions } from '../shell/HeadActions'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { LiteVideo } from '../media/LiteVideo'
import { RECIPES } from './learn/data'
import { RecipePhoto } from './learn/RecipePhoto'
import { MEDCARDS_FLAG } from './learn/Screen'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import NewsView from './news/View'
import { useNewsZone } from './news/Screen'
import Saved from './Saved'
import { DiscoverTabs, panelId, tabId, type View } from './Tabs'
import { WATCH_PICK } from './watch/Screen'
import type { Video } from '../health/library/videosLogic'
import { NewsVideos } from './newsvideo/NewsVideos'
import { READY_TOPICS, countLine, readyShelf as shelf } from './learn/ready'
import './play/play.css' // the fp-hl headline markup is the News screen's own
import './discover.css'
import './today.css'

/** A still picture (i.ytimg.com, no cookies, no referrer), the same one Watch's poster row loads. If it cannot load it hides itself and the tile keeps its text. The Ken Burns zoom is paused while the card is off screen. */
function Thumb({ id }: { id: string }) {
  const [off, setOff] = useState(false)
  const [seen, setSeen] = useState(true) // no IntersectionObserver (old webview, jsdom): keep it running
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setSeen(!!e?.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [off])
  if (off) return null
  return (
    <span className={`dc-still${seen ? '' : ' is-paused'}`} ref={ref}>
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" width={320} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />
    </span>
  )
}

/** The anchor keeps its href (keyboard, middle-click); the click bubbles here and hands the video to Watch. */
const Pick = ({ id, children }: { id: string; children: ReactNode }) => (
  <span className="dc-pick" onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; try { sessionStorage.setItem(WATCH_PICK, id) } catch { /* private mode */ } }}>{children}</span>
)

/** k videos from the list starting at today's turn (wrapping): the same day always gives the same picks, and the shelf changes day by day. The day number comes from dayKey (Date.parse of YYYY-MM-DD is UTC midnight). */
function turn<T>(list: T[], now: Date, k: number): T[] {
  if (!list.length) return []
  const start = Math.floor(Date.parse(dayKey(now)) / 864e5) % list.length
  return Array.from({ length: Math.min(k, list.length) }, (_, i) => list[(start + i) % list.length]!)
}

type Tint = 'green' | 'amber' | 'purple' | 'teal'
/** A video card: the still is the picture, the channel is the kicker. The whole card is a link to Watch (which plays it after a tap). */
function VidCard({ v, tint, className, note }: { v: Video; tint: Tint; className: string; note?: string }) {
  return (
    <Pick id={v.id}>
      <a className={`card dc-vc ${className}`} href="#discover/watch" data-tint={tint} data-testid="dc-vcard">
        <span className="dc-vc-pic"><Thumb id={v.id} /><span className="dc-vc-play" aria-hidden="true"><Icon name="play" size={18} /></span></span>
        <span className="dc-vc-body"><span className="dc-vc-k">{v.source}</span><span className="dc-vc-t">{v.title}</span>{note && <span className="dc-vc-n">{note}</span>}</span>
      </a>
    </Pick>
  )
}

/** Top story: prepping videos, one large and a 2 x 2 grid. */
function TopStory({ now }: { now: Date }) {
  const [hero, ...rest] = turn(shelf('prepping'), now, 5)
  return (
    <Section title="Top story" link={{ href: '#discover/learn/prepping', label: 'All prepping' }} testId="dc-top-story">
      <p className="sub dc-sub">Survival and prepping, a new pick each day.</p>
      {hero
        ? (
          <div className="nw">
            <Pick id={hero.id}>
              <a className="card dc-herocard dc-over" href="#discover/watch" data-hero data-testid="dc-hero">
                <span className="dc-poster-box">
                  <Thumb id={hero.id} />
                  <span className="dc-hchip">Prepping · {hero.source}</span>
                  <span className="dc-hero-play" aria-hidden="true"><Icon name="play" size={28} /></span>
                </span>
                <span className="dc-hero-body" data-contrast-bg="#555555">
                  <span className="dc-hero-t">{hero.title}</span>
                  <span className="dc-hero-s">Plays in privacy mode after you tap</span>
                </span>
              </a>
            </Pick>
            <div className="dc-vgrid" data-testid="dc-top-grid">{rest.map((v) => <VidCard key={v.id} v={v} tint="teal" className="dc-vgcard" />)}</div>
          </div>
        )
        : <EmptyState icon="play" title="No checked videos yet" />}
    </Section>
  )
}

/** A titled shelf of video cards with the channel chips above it; a chip narrows the shelf to that channel, tapping it again shows all. Four cards show, "Show more" adds four at a time (D-156), and the title link says how many there are. */
function VideoShelf({ title, link, testId, videos, tint }: { title: string; link: { href: string; label: string }; testId: string; videos: Video[]; tint: Tint }) {
  const [src, setSrc] = useState<string | null>(null)
  const sources = [...new Set(videos.map((v) => v.source))]
  const list = src ? videos.filter((v) => v.source === src) : videos
  if (!videos.length) return null
  return (
    <Section title={title} link={{ href: link.href, label: `${link.label} ${videos.length}` }} testId={testId}>
      <div className="nw">
        <div className="nw-chips dc-wrapchips" role="group" aria-label={`${title} channels`}>
          {sources.map((s) => <button key={s} type="button" className="nw-chip" aria-pressed={src === s} onClick={() => setSrc(src === s ? null : s)}>{s}</button>)}
        </div>
        <MoreGrid key={src ?? 'all'} label={`${title} videos`} testId={testId + '-row'}>{list.map((v) => <VidCard key={v.id} v={v} tint={tint} className="dc-vgcard" />)}</MoreGrid>
      </div>
    </Section>
  )
}

type LearnCardProps = { tint: Tint; title: string; sub: string; href: string; testId: string }
const LearnCard = (p: LearnCardProps) => (
  <a className="card dc-lc" data-tint={p.tint} href={p.href} data-testid={p.testId}><span className="dc-lc-blob" aria-hidden="true" /><b className="dc-lc-t">{p.title}</b><span className="dc-lc-s">{p.sub}</span><span className="dc-lc-go" aria-hidden="true"><Icon name="chev" size={20} /></span></a>
)

/** Learn: four tinted cards onto existing Learn topics, each with a slow-drifting colour blob. Medicines takes the recipes place once the clinician flag is on (Recipes has its own section below). */
function Learn() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const prep = READY_TOPICS.find((t) => t.id === 'prepping')
  const farm = READY_TOPICS.find((t) => t.id === 'farm-diy')
  return (
    <Section title="Learn" link={{ href: '#discover/learn', label: 'All topics' }} testId="dc-learn">
      <p className="sub dc-sub">Short reads you can open offline.</p>
      <div className="dc-lgrid">
        <LearnCard tint="purple" title="Health topics" sub="Plain reads on heart, sugar and more" href="#health/library" testId="dc-learn-topics" />
        {prep && <LearnCard tint="amber" title="Be prepared" sub={countLine(prep)} href="#discover/learn/prepping" testId="dc-learn-prepping" />}
        {farm && <LearnCard tint="green" title="Garden and farm" sub={countLine(farm)} href="#discover/learn/farm-diy" testId="dc-learn-farm" />}
        {medcards
          ? <LearnCard tint="teal" title="Medicines" sub="What each medicine is for" href="#discover/learn/meds" testId="dc-learn-meds" />
          : <LearnCard tint="teal" title="Low-salt recipes" sub={`${RECIPES.length} low-salt recipes`} href="#discover/learn/recipes" testId="dc-learn-recipes" />}
      </div>
    </Section>
  )
}

/** Listen: one large guided video (plays after a tap, privacy mode), then a row of the rest of the checked listening videos. */
function Listen() {
  const [g, ...rest] = shelf('listen')
  return (
    <Section title="Listen" link={{ href: '#discover/listen', label: `All ${shelf('listen').length}` }} testId="dc-listen">
      {g
        ? (
          <div className="nw">
            <div className="card dc-guided" data-testid="dc-guided">
              <LiteVideo id={g.id} title={g.title} />
              <b className="dc-guided-t">{g.title}</b>
              <span className="dc-guided-s">{g.source} · large controls</span>
            </div>
            {rest.length > 0 && <MoreGrid label="More to listen to" testId="dc-listen-row">{rest.map((v) => <VidCard key={v.id} v={v} tint="purple" className="dc-vgcard" />)}</MoreGrid>}
          </div>
        )
        : <p className="sub">Nothing to listen to yet.</p>}
    </Section>
  )
}

/** Recipes: two-column cards. The app's own low-salt recipes first (ones with a Commons photo first), then recipe videos with a salt reminder. The title link covers the card; the credit link sits above it. */
function Recipes({ now }: { now: Date }) {
  const list = [...RECIPES].sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 4)
  const videos = turn(shelf('recipes-video'), now, 2)
  return (
    <Section title="Recipes" link={{ href: '#discover/learn/recipes', label: `All ${RECIPES.length}` }} testId="dc-recipes">
      <div className="dc-rgrid">
        {list.map((r) => (
          <div key={r.id} className="card dc-rcard" data-testid="dc-recipe">
            <RecipePhoto r={r} />
            <a className="dc-rcard-t" href={'#discover/learn/recipe/' + r.id}>{r.name}</a>
            <span className="dc-rcard-s">{r.minutes} min · {r.blurb}</span>
          </div>
        ))}
        {videos.map((v) => <VidCard key={v.id} v={v} tint="amber" className="dc-vgcard" note="Tip: use less patis and salt" />)}
      </div>
    </Section>
  )
}

function Today({ now }: { now: Date }) {
  return (
    <>
      <Learn />
      <NewsVideos now={now.getTime()} />
      <TopStory now={now} />
      <a className="card dc-hlink" href="#health" data-testid="dc-health-link"><span className="dc-grow">Health videos are in Health</span><Icon name="chev" size={20} /></a>
      <VideoShelf title="Farming and DIY" link={{ href: '#discover/learn/farm-diy', label: 'All' }} testId="dc-farm" videos={shelf('farm-diy')} tint="green" />
      <Listen />
      <Recipes now={now} />
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
    </>
  )
}

function NewsPanel() {
  const zone = useNewsZone()
  return zone === undefined ? <p className="sub" role="status">Loading headlines</p> : <NewsView zone={zone} />
}

/** #discover (S22 board): large title, a Today | News | Saved control, then that view. Today is Learn, Top story (prepping videos), Health videos, Farming and DIY, Listen, Recipes, Play, Did you know. Headlines live on the Today tab (D-142); the News tab here stays. */
export default function Overview({ now = new Date() }: { now?: Date }) {
  const [view, setView] = useState<View>('today')
  return (
    <>
      <LargeTitle testId="dc-head" kicker="Learn, watch, play" title="Discover" actions={<HeadActions><a className="sh-iconbtn dc-search" href="#health/library" aria-label="Search health topics" data-testid="dc-search"><Icon name="search" size={22} /></a></HeadActions>} />
      <DiscoverTabs view={view} onChange={setView} />
      <div role="tabpanel" id={panelId(view)} aria-labelledby={tabId(view)} className="dc-panel">
        {view === 'today' ? <Today now={now} /> : view === 'news' ? <NewsPanel /> : <Saved now={now.getTime()} />}
      </div>
    </>
  )
}
