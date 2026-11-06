import { useState, type ReactNode } from 'react'
import { Carousel, EmptyState, JackArt, LargeTitle, PreviewTile, Section } from '../look'
import { HeadActions } from '../shell/HeadActions'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { LiteVideo } from '../media/LiteVideo'
import { CALM_VIDEOS } from '../calm/media'
import { RECIPES } from './learn/data'
import { RecipePhoto } from './learn/RecipePhoto'
import { MEDCARDS_FLAG } from './learn/Screen'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import { SeasonRow } from './today/Cards'
import { watchPlan } from './today/watchPlan'
import { LeadCard, StoryRow } from './news/Cards'
import { latestFirst } from './news/model'
import NewsView, { useFeed } from './news/View'
import { useNewsZone } from './news/Screen'
import Saved from './Saved'
import { DiscoverTabs, panelId, tabId, type View } from './Tabs'
import { WATCH_PICK } from './watch/Screen'
import { playable, VIDEOS, type Video } from '../health/library/videosLogic'
import { READY_TOPICS, READY_VIDEOS, countLine } from './learn/ready'
import './play/play.css' // the fp-hl headline markup is the News screen's own
import './discover.css'
import './today.css'

/** A still picture (i.ytimg.com, no cookies, no referrer), the same one Watch's poster row loads. If it cannot load it hides itself and the tile keeps its text. */
function Thumb({ id }: { id: string }) {
  const [off, setOff] = useState(false)
  if (off) return null
  return (
    <span className="dc-still">
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" width={320} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />
    </span>
  )
}

/** The anchor keeps its href (keyboard, middle-click); the click bubbles here and hands the video to Watch. */
const Pick = ({ id, children }: { id: string; children: ReactNode }) => (
  <span className="dc-pick" onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; try { sessionStorage.setItem(WATCH_PICK, id) } catch { /* private mode */ } }}>{children}</span>
)

const minutes = (v: Video) => (v.minutes ? ` · ${v.minutes} min` : '')

/** Top story: the newest headline as a large picture card, one more story under it, and a door to the News view. */
function TopStory({ now, onNews }: { now: Date; onNews: () => void }) {
  const zone = useNewsZone()
  return (
    <Section title="Top story" testId="dc-top-story">
      {zone === undefined ? <p className="sub" role="status">Loading headlines</p> : <TopStoryBody zone={zone} now={now} onNews={onNews} />}
    </Section>
  )
}
function TopStoryBody({ zone, now, onNews }: { zone: string | null; now: Date; onNews: () => void }) {
  const feed = useFeed(zone)
  if (!feed) return <p className="sub" role="status">Loading headlines</p>
  const rows = latestFirst(feed.items ?? [])
  if (!rows.length) return <p className="sub">{feed.items === null ? 'The news feed is not connected yet.' : 'No headlines saved yet. They load when you have signal.'}</p>
  return (
    <div className="nw">
      <LeadCard n={rows[0]!} now={now.getTime()} testId="dc-lead" />
      {rows[1] && <StoryRow n={rows[1]} now={now.getTime()} />}
      <button type="button" className="dc-more" onClick={onNews}>All news<Icon name="chev" size={18} /></button>
    </div>
  )
}

/** Watch: one large main video, then a row (two more main videos and one DIY). */
function Watch({ now }: { now: Date }) {
  const prepTopic = READY_TOPICS.find((t) => t.id === 'prepping')?.video
  const diyTopic = READY_TOPICS.find((t) => t.id === 'repairs')?.video
  const prep = READY_VIDEOS.filter((v) => v.topic === prepTopic && playable(v))
  const diy = READY_VIDEOS.filter((v) => v.topic === diyTopic && playable(v))
  const health = VIDEOS.filter(playable)
  const kind = (v: Video) => (v.topic === prepTopic ? 'Prepping' : v.topic === diyTopic ? 'DIY' : 'Health')
  const { hero, row } = watchPlan(now, prep, health, diy)
  const total = prep.length + health.length + diy.length
  return (
    <Section title="Watch" link={{ href: '#discover/watch', label: 'All' }} testId="dc-watch">
      <div data-hero data-testid="dc-hero">
        {hero
          ? (
            <Pick id={hero.id}>
              <a className="card dc-herocard" href="#discover/watch">
                <span className="dc-poster-box">
                  <Thumb id={hero.id} />
                  <span className="dc-hchip">{kind(hero)} · {total} checked videos</span>
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
      {row.length > 0 && (
        <Carousel label="More videos" testId="dc-videos">
          {row.map((v) => (
            <Pick key={v.id} id={v.id}>
              <a className="card dc-vc dc-vrow" href="#discover/watch" data-tint={kind(v) === 'Health' ? 'purple' : 'teal'}>
                <span className="dc-vc-pic"><Thumb id={v.id} /><span className="dc-vc-play" aria-hidden="true"><Icon name="play" size={18} /></span></span>
                <span className="dc-vc-body"><span className="dc-vc-k">{kind(v)}</span><span className="dc-vc-t">{v.title}</span></span>
              </a>
            </Pick>
          ))}
        </Carousel>
      )}
    </Section>
  )
}

type LearnCardProps = { tint: 'green' | 'amber' | 'purple' | 'teal'; title: string; sub: string; href: string; testId: string }
const LearnCard = (p: LearnCardProps) => (
  <a className="card dc-lc" data-tint={p.tint} href={p.href} data-testid={p.testId}><b className="dc-lc-t">{p.title}</b><span className="dc-lc-s">{p.sub}</span><span className="dc-lc-go" aria-hidden="true"><Icon name="chev" size={20} /></span></a>
)

/** Learn: four main tinted cards onto existing Learn topics. Medicines replaces Home repairs once the clinician flag is on. */
function Learn() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const prep = READY_TOPICS.find((t) => t.id === 'prepping')
  const repairs = READY_TOPICS.find((t) => t.id === 'repairs')
  return (
    <Section title="Learn" link={{ href: '#discover/learn', label: 'All topics' }} testId="dc-learn">
      <div className="dc-lgrid">
        <LearnCard tint="purple" title="Health topics" sub="Plain reads on heart, sugar and more" href="#discover/learn/library" testId="dc-learn-topics" />
        {prep && <LearnCard tint="teal" title="Be prepared" sub={countLine(prep)} href="#discover/learn/prepping" testId="dc-learn-prepping" />}
        <LearnCard tint="amber" title="Recipes" sub={`${RECIPES.length} low-salt recipes`} href="#discover/learn/recipes" testId="dc-learn-recipes" />
        {medcards
          ? <LearnCard tint="green" title="Medicines" sub="What each medicine is for" href="#discover/learn/meds" testId="dc-learn-meds" />
          : repairs && <LearnCard tint="green" title="Home repairs" sub={countLine(repairs)} href="#discover/learn/repairs" testId="dc-learn-repairs" />}
      </div>
    </Section>
  )
}

/** Listen: one large guided video from the Calm list (plays after a tap, privacy mode). */
function Listen() {
  const g = CALM_VIDEOS[0]
  return (
    <Section title="Listen" link={{ href: '#discover/listen', label: 'See all' }} testId="dc-listen">
      {g
        ? (
          <div className="card dc-guided" data-testid="dc-guided">
            <LiteVideo id={g.id} title={g.title} />
            <b className="dc-guided-t">{g.title}</b>
            <span className="dc-guided-s">Guided · {g.channel} · large controls</span>
          </div>
        )
        : <p className="sub">Nothing to listen to yet.</p>}
    </Section>
  )
}

/** Recipes: two-column photo cards. Ones with a Commons photo first. The title link covers the card; the credit link sits above it. */
function Recipes() {
  const list = [...RECIPES].sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 4)
  return (
    <Section title="Recipes" link={{ href: '#discover/learn/recipes', label: 'All' }} testId="dc-recipes">
      <div className="dc-rgrid">
        {list.map((r) => (
          <div key={r.id} className="card dc-rcard" data-testid="dc-recipe">
            <RecipePhoto r={r} />
            <a className="dc-rcard-t" href={'#discover/learn/recipe/' + r.id}>{r.name}</a>
            <span className="dc-rcard-s">{r.minutes} min · {r.blurb}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Today({ now, onNews }: { now: Date; onNews: () => void }) {
  return (
    <>
      <TopStory now={now} onNews={onNews} />
      <SeasonRow now={now} />
      <Watch now={now} />
      <Learn />
      <Listen />
      <Recipes />
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

/** #discover (S22 board): large title, a Today | News | Saved control, then that view. Today is Top story, Watch, Learn, Listen, Recipes, Play. */
export default function Overview({ now = new Date() }: { now?: Date }) {
  const [view, setView] = useState<View>('today')
  return (
    <>
      <LargeTitle testId="dc-head" kicker="Learn, watch, play" title="Discover" actions={<HeadActions><a className="sh-iconbtn dc-search" href="#discover/learn/library" aria-label="Search health topics" data-testid="dc-search"><Icon name="search" size={22} /></a></HeadActions>} />
      <DiscoverTabs view={view} onChange={setView} />
      <div role="tabpanel" id={panelId(view)} aria-labelledby={tabId(view)} className="dc-panel">
        {view === 'today' ? <Today now={now} onNews={() => setView('news')} /> : view === 'news' ? <NewsPanel /> : <Saved now={now.getTime()} />}
      </div>
    </>
  )
}
