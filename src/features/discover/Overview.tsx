import { useMemo, useState, type MouseEvent } from 'react'
import { EmptyState, JackArt, LargeTitle, PreviewTile, Section } from '../look'
import { MediaCard } from '../look/media/MediaCard'
import { MediaList } from '../look/media/MediaList'
import { HeadActions } from '../shell/HeadActions'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { track } from '../admin/events'
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
import { trackWatch } from './channels'
import { turn as turnOf } from './today/topStories'
import { useTopStories } from './today/familyWatch'
import { READY_TOPICS, countLine, readyShelf as shelf } from './learn/ready'
import './play/play.css' // the fp-hl headline markup is the News screen's own
import './discover.css'
import './today.css'
import '../today/today.css' // .sf-link-row (See all stories) lives here

const COUNTS = 'dc.watchcounts'
/** Taps per video on this phone (a bounded map: only ids of the fixed shelves are ever stored). The second signal for Top stories and the Farming and DIY lead; nothing leaves the device. */
const readCounts = (): Record<string, number> => { try { const o = JSON.parse(localStorage.getItem(COUNTS) ?? '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} } }
const bump = (id: string) => { try { const c = readCounts(); c[id] = (Number(c[id]) || 0) + 1; localStorage.setItem(COUNTS, JSON.stringify(c)) } catch { /* private mode */ } }
type Ev = 'card_top_story' | 'card_farm_video'

/** A plain tap hands the video to Watch, counts it on this phone and for its channel (watch_ch_<key>, known channels only). The link keeps its href (keyboard, middle-click); a modified click is not counted. */
const tap = (v: Video, ev?: Ev) => (e: MouseEvent) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return
  try { sessionStorage.setItem(WATCH_PICK, v.id) } catch { /* private mode */ }
  bump(v.id)
  if (ev) void track('action', ev)
  trackWatch(v.source)
}

/** A video preview that opens Watch (which plays it after a tap). */
const VidCard = ({ v, variant = 'row', ev, tag, note }: { v: Video; variant?: 'hero' | 'row'; ev?: Ev; tag?: string; note?: string }) => (
  <MediaCard variant={variant} id={v.id} title={v.title} channel={v.source} minutes={v.minutes} href="#discover/watch" onClick={tap(v, ev)} tag={tag} note={note} testId={variant === 'hero' ? 'dc-hero' : 'dc-vcard'} />
)

const TOP_K = 9 // one hero and eight rows: 4 rows then Show more (D-156)
const topPool = () => [...shelf('prepping'), ...shelf('farm-diy')]

/** Top stories (S28): farming, DIY and prepping videos together, ranked by the channels the family watches (family counts, else this phone's, else the day's turn), fixed for the day. One hero, then rows. null = the day's order is still being read. */
function TopStory({ ranked }: { ranked: Video[] | null }) {
  const [hero, ...rest] = ranked ?? []
  return (
    <Section title="Top stories" testId="dc-top-story">
      <p className="sub dc-sub">Farming, DIY and prepping, picked for your family.</p>
      {!ranked
        ? <p className="sub" role="status">Picking videos</p>
        : hero
        ? (
          <div className="dc-stack">
            <VidCard v={hero} variant="hero" ev="card_top_story" />
            <a className="sf-link-row" href="#discover/watch" data-testid="dc-top-all">See all stories<Icon name="chev" size={20} /></a>
            {rest.length > 0 && <MediaList label="More top stories" testId="dc-top-rows">{rest.map((v) => <VidCard key={v.id} v={v} ev="card_top_story" />)}</MediaList>}
          </div>
        )
        : <EmptyState icon="play" title="No checked videos yet" />}
    </Section>
  )
}

/** Farming and DIY: one labelled Channel menu (default All channels), then rows (the video tapped most on this phone first, tagged), 4 and "Show 4 more" (D-156). Videos already in Top stories are left out of the all-channels list. The title link says how many there are. */
function FarmShelf({ title, link, testId, videos, skip }: { title: string; link: { href: string; label: string }; testId: string; videos: Video[]; skip: Set<string> }) {
  const [src, setSrc] = useState('')
  const sources = [...new Set(videos.map((v) => v.source))]
  const list = src ? videos.filter((v) => v.source === src) : videos.filter((v) => !skip.has(v.id))
  if (!videos.length) return null
  const counts = readCounts()
  const top = list.reduce<Video | undefined>((m, v) => (!m || (counts[v.id] ?? 0) > (counts[m.id] ?? 0) ? v : m), undefined)
  const popular = !!top && (counts[top.id] ?? 0) > 0
  const lead = popular ? top : undefined
  const ordered = lead ? [lead, ...list.filter((v) => v !== lead)] : list
  return (
    <Section title={title} link={{ href: link.href, label: `${link.label} ${videos.length}` }} testId={testId}>
      <div className="dc-stack">
        <div className="dc-chan">
          <label htmlFor={testId + '-ch'} className="dc-chan-l">Channel</label>
          <select id={testId + '-ch'} className="dc-select" value={src} onChange={(e) => setSrc(e.target.value)}>
            <option value="">All channels</option>
            {sources.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <MediaList key={src || 'all'} label={`${title} videos`} testId={testId + '-row'}>{ordered.map((v) => <VidCard key={v.id} v={v} ev="card_farm_video" tag={v === lead ? 'Most watched' : undefined} />)}</MediaList>
      </div>
    </Section>
  )
}

type Tint = 'green' | 'amber' | 'purple' | 'teal'
type LearnCardProps = { tint: Tint; title: string; sub: string; href: string; testId: string }
const LearnCard = (p: LearnCardProps) => (
  <a className="card dc-lc" data-tint={p.tint} href={p.href} data-testid={p.testId} onClick={() => void track('action', 'card_learn')}><span className="dc-lc-blob" aria-hidden="true" /><b className="dc-lc-t">{p.title}</b><span className="dc-lc-s">{p.sub}</span><span className="dc-lc-go" aria-hidden="true"><Icon name="chev" size={20} /></span></a>
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

/** Listen: one large guided video (plays after a tap, privacy mode), then the rest of the checked listening videos as cards. */
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
            {rest.length > 0 && <MediaList label="More to listen to" testId="dc-listen-row">{rest.map((v) => <VidCard key={v.id} v={v} />)}</MediaList>}
          </div>
        )
        : <p className="sub">Nothing to listen to yet.</p>}
      <a className="card dc-hlink" href="#discover/listen/radio" data-testid="dc-radio-link"><span className="dc-grow">Philippine radio: music, pop and news</span><Icon name="chev" size={20} /></a>
    </Section>
  )
}

/** Recipes: two-column cards. The app's own low-salt recipes first (ones with a Commons photo first), then recipe videos with a salt reminder. The title link covers the card; the credit link sits above it. */
function Recipes({ now }: { now: Date }) {
  const list = [...RECIPES].sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 4)
  const videos = turnOf(shelf('recipes-video'), now, 2)
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
      </div>
      <MediaList label="Recipe videos" testId="dc-recipe-videos">{videos.map((v) => <VidCard key={v.id} v={v} note="Tip: use less patis and salt" />)}</MediaList>
    </Section>
  )
}

function Today({ now }: { now: Date }) {
  const ranked = useTopStories(topPool, now, TOP_K, readCounts) // the day's order, stored once (family counts are read in the background, at most twice a day, and used from the next open): it does not move after first paint
  const skip = useMemo(() => new Set((ranked ?? []).map((v) => v.id)), [ranked])
  return (
    <>
      <Learn />
      <TopStory ranked={ranked} />
      <NewsVideos now={now.getTime()} />
      <Listen />
      <FarmShelf title="Farming and DIY" link={{ href: '#discover/learn/farm-diy', label: 'All' }} testId="dc-farm" videos={shelf('farm-diy')} skip={skip} />
      <a className="card dc-hlink" href="#health" data-testid="dc-health-link"><span className="dc-grow">Health videos are in Health</span><Icon name="chev" size={20} /></a>
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

/** #discover (S22 board): large title, a Today | News | Saved control, then that view. Today is Learn, Top stories (farming, DIY and prepping videos ranked by what the family watches), Regional news, Listen, Farming and DIY, the Health pointer, Recipes, Play, Did you know. Headlines live on the Today tab (D-142); the News tab here stays. */
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
