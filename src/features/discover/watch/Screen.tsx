import { useRef, useState } from 'react'
import { Row } from '../../look'
import type { IconName } from '../../shell/Icon'
import { LiteVideo } from '../../media/LiteVideo'
import { playable, VIDEOS, type Video } from '../../health/library/videosLogic'

const TOPIC_ICON: Record<string, IconName> = { Move: 'move', Safety: 'shield', Mind: 'brain', Diabetes: 'drop', Food: 'meal' }

/** A 160 x 90 still picture (i.ytimg.com, no cookies). If it cannot load, the drawn tile and the title stand in. Tapping it picks the video; nothing else loads from YouTube. */
function Poster({ v, on, pick }: { v: Video; on: boolean; pick: () => void }) {
  const [off, setOff] = useState(false)
  return (
    <li>
      <button type="button" className="dc-poster" aria-pressed={on} aria-label={`Choose ${v.title}${v.minutes ? `, ${v.minutes} minutes` : ''}`} data-thumb={off ? 'off' : 'on'} onClick={pick}>
        {!off && <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" width={160} height={90} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />}
        <span className="dc-poster-cap"><b>{v.title}</b>{v.minutes ? <span>{v.minutes} min</span> : null}</span>
      </button>
    </li>
  )
}

/** Discover > Watch: a checked list of official videos. A poster row (scrolls inside itself), the chosen video in a player that loads only after a second tap (LiteVideo, no-cookie address,
 *  with an "Open in YouTube" link), then one row per topic and Live TV (coming). */
export default function Watch() {
  const all = VIDEOS.filter(playable)
  const topics = [...new Set(all.map((v) => v.topic))]
  const [topic, setTopic] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const player = useRef<HTMLDivElement>(null)
  const list = topic ? all.filter((v) => v.topic === topic) : all
  const chosen = list.find((v) => v.id === sel)
  const pick = (id: string) => { setSel(id); setTimeout(() => player.current?.scrollIntoView?.({ block: 'nearest' }), 0) }
  return (
    <div className="dc-list" data-testid="watch">
      <div className="dc-sh"><h2 className="sh-h2">{topic ?? 'Checked videos'}</h2><span className="sub">{list.length}</span></div>
      <ul className="dc-posters" aria-label={topic ? `${topic} videos` : 'Checked videos'}>
        {list.map((v) => <Poster key={v.id} v={v} on={v.id === sel} pick={() => pick(v.id)} />)}
      </ul>
      {chosen && (
        <div ref={player} className="card dc-player" data-testid="watch-player">
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
      <p className="sub dc-quiet">Checked videos only. Each one plays here after you tap it, or opens in YouTube.</p>
    </div>
  )
}
