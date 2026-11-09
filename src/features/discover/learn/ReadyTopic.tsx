import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../shell/Icon'
import { SubHeader } from '../../shell/SubHeader'
import { LiteVideo } from '../../media/LiteVideo'
import { MediaCard } from '../../look/media/MediaCard'
import { MediaList } from '../../look/media/MediaList'
import { playable } from '../../health/library/videosLogic'
import { trackWatch } from '../channels'
import { READY_READS, READY_TOPICS, READY_VIDEOS } from './ready'
import './learn.css'

/** #discover/learn/prepping and /farm-diy (the old /repairs link redirects there): the checked videos (media cards, 4 then Show more; the tapped one plays here after a second tap) and reads (open outside) for one D-117 topic. */
export default function Ready({ id }: { id: string }) {
  return <ReadyBody key={id} id={id} /> // a new topic starts with its own 4 cards and no chosen video
}

function ReadyBody({ id }: { id: string }) {
  const t = READY_TOPICS.find((x) => x.id === id)
  const [sel, setSel] = useState<string | null>(null)
  const player = useRef<HTMLDivElement>(null)
  useEffect(() => { if (sel) player.current?.querySelector<HTMLElement>('.lv-play, .lv-yt')?.focus() }, [sel]) // S26: focus moves to the player when it opens
  if (!t) return null
  const videos = READY_VIDEOS.filter((v) => v.topic === t.video && playable(v))
  const reads = READY_READS.filter((r) => r.topic === t.id)
  const chosen = videos.find((v) => v.id === sel)
  return (
    <div className="lr" data-testid={'ready-' + t.id}>
      <SubHeader title={t.title} backHref="#discover/learn" backLabel="Back to Learn" />
      <h2 className="sh-h2">Videos</h2>
      {chosen && (
        <div ref={player} className="card ry-video" data-testid="ready-player" onClickCapture={(e) => { if ((e.target as Element).closest('.lv-play')) trackWatch(chosen.source) }}>
          <LiteVideo key={chosen.id} id={chosen.id} title={chosen.title} minutes={chosen.minutes} />
          <span className="sub">{chosen.source}</span>
        </div>
      )}
      <MediaList label={`${t.title} videos`} testId="ready-videos">
        {videos.map((v) => <MediaCard key={v.id} variant="row" id={v.id} title={v.title} channel={v.source} minutes={v.minutes} pressed={v.id === sel} onClick={() => { setSel(v.id); trackWatch(v.source) }} />)}
      </MediaList>
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
