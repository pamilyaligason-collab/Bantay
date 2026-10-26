import { videoOfTheDay } from './videos'
import { playable, VIDEOS } from '../health/library/videosLogic'
import { LiteVideo } from '../media/LiteVideo'

/** Video of the day: one from the fixed, checked list (src/data/videos.json), played inline. Nothing loads from YouTube until it is tapped. */
export default function VideoCard() {
  const list = VIDEOS.filter(playable)
  if (!list.length) return null
  const v = videoOfTheDay(new Date(), list)
  return (
    <section aria-labelledby="td-vid" data-reveal>
      <div className="td-sech"><h2 id="td-vid">Video of the day</h2><span className="td-sub">new each morning</span></div>
      <div className="card">
        <LiteVideo id={v.id} title={v.title} minutes={v.minutes} />
        <p className="td-sub">{v.source}</p>
      </div>
    </section>
  )
}
