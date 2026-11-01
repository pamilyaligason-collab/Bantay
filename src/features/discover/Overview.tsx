import { useState } from 'react'
import { EmptyState, LargeTitle, PreviewTile } from '../look'
import { SeasonRow } from './today/Cards'
import { featured } from './today/featured'
import { playable, VIDEOS, type Video } from '../health/library/videosLogic'
import './discover.css'

/** A still picture (i.ytimg.com, no cookies, no referrer), the same one Watch's poster row loads. If it cannot load it hides itself and the tile keeps its text. */
function Thumb({ id }: { id: string }) {
  const [off, setOff] = useState(false)
  if (off) return null
  return (
    <span className="dc-thumb">
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />
    </span>
  )
}

/** #discover (v13): large title, the video of the day, two more videos, then the season row. */
export default function Overview({ now = new Date() }: { now?: Date }) {
  const vids = VIDEOS.filter(playable)
  const { hero, more } = featured<Video>(now, vids)
  return (
    <>
      <LargeTitle testId="dc-head" kicker="Learn, watch, play" title="Discover" />
      <div data-hero data-testid="dc-hero">
        {hero
          ? <PreviewTile kicker={`Watch · ${vids.length} checked videos`} tint="blue" value={hero.title} valueSize="md" sub="Plays in privacy mode after you tap" action="Watch" href="#discover/watch" media={<Thumb id={hero.id} />} />
          : <EmptyState icon="play" title="No checked videos yet" />}
      </div>
      {more.length > 0 && (
        <div className="pt-grid" data-testid="dc-videos">
          {more.map((v, i) => <PreviewTile key={v.id} kicker={v.topic} tint={i ? 'purple' : 'teal'} value={v.title} valueSize="md" action="Watch" href="#discover/watch" media={<Thumb id={v.id} />} />)}
        </div>
      )}
      <SeasonRow now={now} />
    </>
  )
}
