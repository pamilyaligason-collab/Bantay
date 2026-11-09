import { useEffect, useRef, useState } from 'react'
import { LiteVideo } from '../media/LiteVideo'
import { Section } from '../look'
import { MediaCard, type MediaVariant } from '../look/media/MediaCard'
import { MediaList } from '../look/media/MediaList'
import { forSub, SUBS, type VideoSub } from './library/videosLogic'
import './health.css'

export interface PlayVideo { id: string; title: string; source: string; minutes?: number | null; ph?: boolean }

/** One video: a MediaCard (D-180) until it is tapped, then LiteVideo takes its place across the list and plays at once. The still comes from i.ytimg.com (no cookies, no referrer); the player (youtube-nocookie.com) loads only after the tap. A Philippine source carries the "Philippines" tag. `big` gives the opened player the large play disc (Listen). */
export function VideoCard({ video, open, onOpen, testId, variant = 'row', big }: { video: PlayVideo; open: boolean; onOpen: () => void; testId?: string; variant?: MediaVariant; big?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; box.current?.focus(); box.current?.querySelector<HTMLButtonElement>('.lv-play')?.click() }, [open]) // the first tap was the play tap: do not ask for a second
  const meta = `${video.source}${video.minutes != null ? ` · ${video.minutes} min` : ''}`
  return (
    <div className="hv-vc" data-open={open ? '' : undefined} data-testid={testId ?? `hv-${video.id}`}>
      {open ? (
        <div className={`hv-opened${big ? ' dc-bigrow' : ''}`} ref={box} tabIndex={-1}>
          <LiteVideo id={video.id} title={video.title} minutes={video.minutes} />
          <p className="sub">{meta}</p>
        </div>
      ) : (
        <MediaCard variant={variant} id={video.id} title={video.title} channel={video.source} minutes={video.minutes} tag={video.ph ? 'Philippines' : undefined} onClick={onOpen} />
      )}
    </div>
  )
}

/** A VideoCard that keeps its own open state (Calm and Listen); Health keeps one open at a time itself. */
export function PlayCard({ video, variant, big, testId }: { video: PlayVideo; variant?: MediaVariant; big?: boolean; testId?: string }) {
  const [open, setOpen] = useState(false)
  return <VideoCard video={video} open={open} onOpen={() => setOpen(true)} variant={variant} big={big} testId={testId} />
}
/** Health > Health videos: chips by sub-topic (tap again to see all), then one column of checked videos (all rows: Health already has its one hero), four at a time. Philippine sources first. Nothing loads from YouTube but the stills until a card is tapped. */
export function HealthVideos() {
  const [sub, setSub] = useState<VideoSub | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = forSub(sub)
  const chips = SUBS.filter((s) => forSub(s.sub).length > 0)
  return (
    <Section title="Health videos" testId="health-videos" id="health-videos">
      <div className="hv-chips" role="group" aria-label="Video topic">
        {chips.map((c) => <button key={c.sub} type="button" className="hv-chip" aria-pressed={sub === c.sub} onClick={() => { setSub(sub === c.sub ? null : c.sub); setOpenId(null) }}>{c.label}</button>)}
      </div>
      <MediaList key={sub ?? 'all'} label={sub ? `${SUBS.find((s) => s.sub === sub)!.label} videos` : 'Health videos'} testId="hv-grid">
        {list.map((v) => <VideoCard key={v.id} video={v} open={openId === v.id} onOpen={() => setOpenId(v.id)} />)}
      </MediaList>
      <p className="sub">Videos from named health channels. Not medical advice.</p>
    </Section>
  )
}
