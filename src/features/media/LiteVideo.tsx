import { useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import { VIDEO_ID } from '../health/library/videosLogic'
import { useOnline } from './useOnline'
import './media.css'


/** Click-to-load pattern (self-built, no dependency). Before the tap the poster shows the video's still picture (i.ytimg.com, no cookies, no referrer),
 *  its title and its length when known; the player itself (youtube-nocookie.com) loads only after the tap. If the picture cannot load, a drawn poster stands in. */
export function LiteVideo({ id, title, start, minutes }: { id: string; title: string; start?: number; minutes?: number | null }) {
  const [playing, setPlaying] = useState(false)
  const [noThumb, setNoThumb] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const online = useOnline()
  if (!VIDEO_ID.test(id)) return null
  const t = typeof start === 'number' && Number.isFinite(start) && start > 0 ? Math.floor(start) : null
  const len = typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : null
  const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1${t ? `&start=${t}` : ''}`
  const watch = `https://www.youtube.com/watch?v=${id}${t ? `&t=${t}s` : ''}`
  return (
    <div className="lv">
      {!online ? (
        <div className="lv-poster lv-off" role="status"><b>{title}</b><span>Open when online</span></div>
      ) : playing ? (
        <iframe ref={frame} className="lv-frame" src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" className="lv-poster lv-play" data-thumb={noThumb ? 'off' : 'on'} onClick={() => { setPlaying(true); setTimeout(() => frame.current?.focus(), 0) }} aria-label={`Play ${title}${len ? `, ${len} minutes` : ''}`}>
          {!noThumb && <img className="lv-img" src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setNoThumb(true)} />}
          <span className="lv-btn" aria-hidden="true"><Icon name="play" size={32} active /></span>
          <span className="lv-cap"><b>{title}</b>{len && <span className="lv-len">{len} min</span>}</span>
        </button>
      )}
      <a className="lv-yt" href={watch} target="_blank" rel="noopener noreferrer"><Icon name="out" size={18} />Open in YouTube<span className="lv-sr"> (opens in new tab)</span></a>
    </div>
  )
}

export default LiteVideo
