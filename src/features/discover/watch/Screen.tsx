import { useEffect, useRef, useState } from 'react'
import { Row } from '../../look'
import { MediaCard } from '../../look/media/MediaCard'
import { MediaList } from '../../look/media/MediaList'
import { Icon, type IconName } from '../../shell/Icon'
import { LiteVideo } from '../../media/LiteVideo'
import { playable } from '../../health/library/videosLogic'
import { DISCOVER_VIDEOS } from '../learn/ready'
import { trackWatch } from '../channels'

const TOPIC_ICON: Record<string, IconName> = { 'Be prepared': 'bag', 'Farming and DIY': 'home', Listen: 'moon', 'Recipe videos': 'meal' }

/** The Discover overview stores the tapped video's id here; Watch opens it once and clears it. */
export const WATCH_PICK = 'dc.watch'
const readPick = () => { try { return sessionStorage.getItem(WATCH_PICK) } catch { return null } }

/** Discover > Watch: a checked list of official videos. One column of 4 video cards with Show more (D-156, D-180), the chosen video in a player that loads only after a second tap (LiteVideo, no-cookie address,
 *  with an "Open in YouTube" link), then one row per topic and Live TV (coming). */
export default function Watch() {
  const all = DISCOVER_VIDEOS.filter(playable)
  const topics = [...new Set(all.map((v) => v.topic))]
  const [topic, setTopic] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(readPick)
  const player = useRef<HTMLDivElement>(null)
  // shortcut: sessionStorage carries the tapped video because #discover/watch/<id> would fall off the sub-root header rule; upgrade when Discover routes grow a param
  useEffect(() => { try { sessionStorage.removeItem(WATCH_PICK) } catch { /* private mode */ } }, [])
  const list = topic ? all.filter((v) => v.topic === topic) : all
  const chosen = list.find((v) => v.id === sel)
  useEffect(() => { if (chosen) player.current?.querySelector<HTMLElement>('.lv-play, .lv-yt')?.focus() }, [chosen?.id]) // S26: focus moves to the player when it opens
  const pick = (id: string) => { setSel(id); trackWatch(all.find((v) => v.id === id)?.source); setTimeout(() => player.current?.scrollIntoView?.({ block: 'nearest' }), 0) }
  return (
    <div className="dc-list" data-testid="watch">
      <div className="dc-sh"><h2 className="sh-h2">{topic ?? 'Checked videos'}</h2><span className="sub">{list.length}</span></div>
      <MediaList key={topic ?? 'all'} label={topic ? `${topic} videos` : 'Checked videos'} testId="watch-grid">
        {list.map((v) => <MediaCard key={v.id} variant="row" id={v.id} title={v.title} channel={v.source} minutes={v.minutes} pressed={v.id === sel} onClick={() => pick(v.id)} />)}
      </MediaList>
      {chosen && (
        <div ref={player} className="card dc-player" data-testid="watch-player" onClickCapture={(e) => { if ((e.target as Element).closest('.lv-play')) trackWatch(chosen.source) }}>
          <LiteVideo key={chosen.id} id={chosen.id} title={chosen.title} minutes={chosen.minutes} />
          <span className="sub">{chosen.topic} · {chosen.source}</span>
        </div>
      )}
      <div className="card dc-prows" data-hue="terra" role="group" aria-label="Playlists">
        {topics.map((t) => {
          const n = all.filter((v) => v.topic === t).length
          return <Row key={t} icon={TOPIC_ICON[t] ?? 'play'} title={t} sub={topic === t ? `Showing ${n}. Tap to show all` : `${n} video${n === 1 ? '' : 's'}`} onClick={() => { setTopic(topic === t ? null : t); setSel(null) }} testId={'playlist-' + t} />
        })}
        <Row icon="play" title="Live TV" sub="News and weather. Coming soon" testId="live-tv" />
      </div>
      <a className="card dc-hlink" href="#health" data-testid="watch-health-link"><span className="dc-grow">Health videos are in Health</span><Icon name="chev" size={20} /></a>
      <p className="sub dc-quiet">Videos from named channels. Each one plays here after you tap it, or opens in YouTube.</p>
    </div>
  )
}
