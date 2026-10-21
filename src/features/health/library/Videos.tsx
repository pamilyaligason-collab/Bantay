import { useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { embedUrl, forTopic, TOPICS, type Video } from './videosLogic'
import '../health.css'
import '../m7a.css'
import { Icon } from '../../shell/Icon'

function Card({ v, playing, onPlay }: { v: Video; playing: boolean; onPlay: () => void }) {
  const url = playing ? embedUrl(v) : null
  return (
    <li className="card vd-card">
      {url ? (
        <iframe className="vd-frame" src={url} title={v.title} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
      ) : playing ? (
        <p className="sub vd-soon" role="status">Coming soon: this video is not set up yet.</p>
      ) : (
        <button type="button" className="vd-play" onClick={onPlay} aria-label={`Play ${v.title}`}>
          <Icon name="play" size={28} active />
        </button>
      )}
      <span className="vd-t"><b>{v.title}</b><span className="sub">{v.topic} · {v.minutes} min · {v.source}</span></span>
    </li>
  )
}

/** #health/videos: a fixed, checked playlist. The player (YouTube, no-cookie address) loads only after a tap. */
export default function Videos() {
  const [topic, setTopic] = useState('All')
  const [playing, setPlaying] = useState<string | null>(null)
  const list = forTopic(topic)
  return (
    <>
      <SubHeader title="Videos" backHref="#health" backLabel="Back to Health" />
      <div className="seg vd-topics" role="group" aria-label="Topic">
        {TOPICS.map((t) => <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>)}
      </div>
      <ul className="vd-list">
        {list.map((v) => <Card key={v.id} v={v} playing={playing === v.id} onPlay={() => setPlaying(v.id)} />)}
      </ul>
      <p className="sub">Videos play inside the app (YouTube, no cookies until you tap) from a fixed, checked list. No search, no suggestions.</p>
    </>
  )
}
