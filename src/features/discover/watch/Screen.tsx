import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Row } from '../../look'
import { MediaCard } from '../../look/media/MediaCard'
import { MediaList } from '../../look/media/MediaList'
import { Icon } from '../../shell/Icon'
import { LiteVideo } from '../../media/LiteVideo'
import { playable } from '../../health/library/videosLogic'
import { DISCOVER_VIDEOS } from '../learn/ready'
import { trackWatch } from '../channels'

const chipId = (t: string | null) => 'dc-watch-chip-' + (t ?? 'all').replace(/\W+/g, '-')

/** The Discover overview stores the tapped video's id here; Watch opens it once and clears it. */
export const WATCH_PICK = 'dc.watch'
const readPick = () => { try { return sessionStorage.getItem(WATCH_PICK) } catch { return null } }

/** Discover > Watch: a checked list of official videos. One column of 4 video cards with Show more (D-156, D-180), the chosen video in a player that loads only after a second tap (LiteVideo, no-cookie address,
 *  with an "Open in YouTube" link), and Live TV (coming). S30 L6: the topic chips sit directly above the videos they swap (tabs with a selected state, a heading that names the topic, a polite announcement). */
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
  const first = useRef(true)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (first.current) { first.current = false; return } panel.current?.scrollIntoView?.({ block: 'nearest' }) }, [topic]) // a new topic starts at its first video
  const choose = (t: string | null) => { setTopic(t); setSel(null) }
  const tabs: (string | null)[] = [null, ...topics]
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    choose(tabs[to]!)
    document.getElementById(chipId(tabs[to]!))?.focus()
  }
  const pick = (id: string) => { setSel(id); trackWatch(all.find((v) => v.id === id)?.source); setTimeout(() => player.current?.scrollIntoView?.({ block: 'nearest' }), 0) }
  return (
    <div className="dc-list" data-testid="watch">
      <div className="dc-wchips" role="tablist" aria-label="Video topics" data-testid="watch-chips">
        {tabs.map((t, i) => (
          <button key={t ?? 'all'} id={chipId(t)} type="button" role="tab" aria-selected={t === topic} aria-controls="dc-watch-panel" tabIndex={t === topic ? 0 : -1} data-testid={'playlist-' + (t ?? 'All')} onClick={() => choose(t)} onKeyDown={(e) => move(e, i)}>{t ?? 'All'}</button>
        ))}
      </div>
      <div ref={panel} id="dc-watch-panel" className="dc-wpanel" role="tabpanel" aria-labelledby={chipId(topic)} key={topic ?? 'all'}>
        <div className="dc-sh"><h2 className="sh-h2">{`Watch · ${topic ?? 'All videos'}`}</h2><span className="sub">{list.length}</span></div>
        <MediaList label={topic ? `${topic} videos` : 'Checked videos'} testId="watch-grid">
          {list.map((v) => <MediaCard key={v.id} variant="row" id={v.id} title={v.title} channel={v.source} minutes={v.minutes} pressed={v.id === sel} onClick={() => pick(v.id)} />)}
        </MediaList>
      </div>
      <p className="dc-vh" role="status" aria-live="polite" data-testid="watch-live">{`Showing ${list.length} ${topic ?? 'checked'} videos`}</p>
      {chosen && (
        <div ref={player} className="card dc-player" data-testid="watch-player" onClickCapture={(e) => { if ((e.target as Element).closest('.lv-play')) trackWatch(chosen.source) }}>
          <LiteVideo key={chosen.id} id={chosen.id} title={chosen.title} minutes={chosen.minutes} />
          <span className="sub">{chosen.topic} · {chosen.source}</span>
        </div>
      )}
      <div className="card dc-prows" data-hue="terra" role="group" aria-label="Coming soon">
        <Row icon="play" title="Live TV" sub="News and weather. Coming soon" testId="live-tv" />
      </div>
      <a className="card dc-hlink" href="#health" data-testid="watch-health-link"><span className="dc-grow">Health videos are in Health</span><Icon name="chev" size={20} /></a>
      <p className="sub dc-quiet">Videos from named channels. Each one plays here after you tap it, or opens in YouTube.</p>
    </div>
  )
}
