import { useEffect, useRef, useState } from 'react'
import { LiteVideo } from '../media/LiteVideo'
import { MoreGrid, Section } from '../look'
import { Icon } from '../shell/Icon'
import { forSub, SUBS, type Video, type VideoSub } from './library/videosLogic'
import './health.css'

/** One card: the video's still (i.ytimg.com, no cookies, no referrer), title, source, length and a small PH flag for a Philippine source. A tap opens it across the grid and plays it in LiteVideo. */
function VideoCard({ video, open, onOpen }: { video: Video; open: boolean; onOpen: () => void }) {
  const [bad, setBad] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) box.current?.querySelector<HTMLButtonElement>('.lv-play')?.click() }, [open]) // the first tap was the play tap: do not ask for a second
  const meta = `${video.source}${video.minutes != null ? ` · ${video.minutes} min` : ''}`
  return (
    <div className="card hv-vc" data-open={open ? '' : undefined} data-testid={`hv-${video.id}`}>
      {open ? (
        <div className="hv-open" ref={box}>
          <LiteVideo id={video.id} title={video.title} minutes={video.minutes} />
          <p className="sub">{meta}</p>
        </div>
      ) : (
        <button type="button" className="hv-vbtn" onClick={onOpen} aria-label={`Play ${video.title}, ${meta}${video.ph ? ', Philippine source' : ''}`}>
          <span className="hv-still" data-still={bad ? 'off' : 'on'}>
            {!bad && <img className="hv-img" src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} />}
            <span className="hv-play" aria-hidden="true"><Icon name="play" size={24} /></span>
            {video.ph && <span className="hv-ph" aria-hidden="true">PH</span>}
            {video.minutes != null && <span className="hv-len" aria-hidden="true">{video.minutes} min</span>}
          </span>
          <b>{video.title}</b>
          <span className="sub">{video.source}</span>
        </button>
      )}
    </div>
  )
}

/** Health > Health videos: chips by sub-topic (tap again to see all), then a grid of checked videos, four at a time. Philippine sources first. Nothing loads from YouTube but the stills until a card is tapped. */
export function HealthVideos() {
  const [sub, setSub] = useState<VideoSub | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = forSub(sub)
  const chips = SUBS.filter((s) => forSub(s.sub).length > 0)
  return (
    <Section title="Health videos" testId="health-videos">
      <div className="hv-chips" role="group" aria-label="Video topic">
        {chips.map((c) => <button key={c.sub} type="button" className="hv-chip" aria-pressed={sub === c.sub} onClick={() => { setSub(sub === c.sub ? null : c.sub); setOpenId(null) }}>{c.label}</button>)}
      </div>
      <MoreGrid key={sub ?? 'all'} label={sub ? `${SUBS.find((s) => s.sub === sub)!.label} videos` : 'Health videos'} testId="hv-grid">
        {list.map((v) => <VideoCard key={v.id} video={v} open={openId === v.id} onOpen={() => setOpenId(v.id)} />)}
      </MoreGrid>
      <p className="sub">Checked videos only. Play inside Bantay.</p>
    </Section>
  )
}
