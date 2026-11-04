import { Icon } from '../../shell/Icon'
import { SubHeader } from '../../shell/SubHeader'
import { LiteVideo } from '../../media/LiteVideo'
import { playable } from '../../health/library/videosLogic'
import { READY_READS, READY_TOPICS, READY_VIDEOS } from './ready'
import './learn.css'

/** #discover/learn/prepping and /repairs: the checked videos (click to load) and reads (open outside) for one D-117 topic. */
export default function Ready({ id }: { id: string }) {
  const t = READY_TOPICS.find((x) => x.id === id)
  if (!t) return null
  const videos = READY_VIDEOS.filter((v) => v.topic === t.video && playable(v))
  const reads = READY_READS.filter((r) => r.topic === t.id)
  return (
    <div className="lr" data-testid={'ready-' + t.id}>
      <SubHeader title={t.title} backHref="#discover/learn" backLabel="Back to Learn" />
      <h2 className="sh-h2">Videos</h2>
      {videos.map((v) => (
        <div key={v.id} className="card ry-video">
          <LiteVideo id={v.id} title={v.title} minutes={v.minutes} />
          <span className="sub">{v.source}</span>
        </div>
      ))}
      <h2 className="sh-h2">Reads</h2>
      {reads.map((r) => (
        <a key={r.id} className="card press lr-tile" href={r.url} target="_blank" rel="noopener noreferrer">
          <span className="lr-grow"><b className="sh-h2">{r.title}</b><span className="dc-src">Source: {r.source}, checked <span className="nw">{r.checked}</span></span></span>
          <Icon name="out" />
          <span className="dc-sr">Opens outside the app</span>
        </a>
      ))}
    </div>
  )
}
