import { useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { forTopic, TOPICS, type Video } from './videosLogic'
import { LiteVideo } from '../../media/LiteVideo'
import '../health.css'
import '../m7a.css'

function Card({ v }: { v: Video }) {
  return (
    <li className="card vd-card">
      {v.placeholder ? <p className="sub vd-soon" role="status">Coming soon: this video is not set up yet.</p> : <LiteVideo id={v.id} title={v.title} />}
      <span className="vd-t"><b>{v.title}</b><span className="sub">{v.topic}{v.minutes != null ? ` · ${v.minutes} min` : ''} · {v.source}</span></span>
    </li>
  )
}

/** #health/videos: a fixed, checked playlist. Nothing loads from YouTube until a video is tapped (LiteVideo, no-cookie address). */
export default function Videos() {
  const [topic, setTopic] = useState('All')
  const list = forTopic(topic)
  return (
    <>
      <SubHeader title="Videos" backHref="#health" backLabel="Back to Health" />
      <div className="seg vd-topics" role="group" aria-label="Topic">
        {TOPICS.map((t) => <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>)}
      </div>
      <ul className="vd-list">
        {list.map((v) => <Card key={v.id} v={v} />)}
      </ul>
      <p className="sub">Videos play inside the app (YouTube, no cookies until you tap) from a fixed, checked list. No search, no suggestions.</p>
    </>
  )
}
