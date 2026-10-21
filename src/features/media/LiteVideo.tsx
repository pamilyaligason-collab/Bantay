import { useState } from 'react'
import { Icon } from '../shell/Icon'
import { useOnline } from './useOnline'
import './media.css'

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Same idea as lite-youtube-embed (Apache-2.0, docs/ASSETS.md): a poster that loads nothing from YouTube until tapped.
 *  We draw the poster ourselves (title + icon), so not even i.ytimg.com is contacted before the tap. The player is the no-cookie address. */
export function LiteVideo({ id, title, start }: { id: string; title: string; start?: number }) {
  const [playing, setPlaying] = useState(false)
  const online = useOnline()
  if (!VIDEO_ID.test(id)) return null
  const t = typeof start === 'number' && Number.isFinite(start) && start > 0 ? Math.floor(start) : null
  const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1${t ? `&start=${t}` : ''}`
  const watch = `https://www.youtube.com/watch?v=${id}${t ? `&t=${t}s` : ''}`
  return (
    <div className="lv">
      {!online ? (
        <div className="lv-poster lv-off" role="status"><b>{title}</b><span>Open when online</span></div>
      ) : playing ? (
        <iframe className="lv-frame" src={src} title={title} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" className="lv-poster lv-play" onClick={() => setPlaying(true)} aria-label={`Play ${title}`}>
          <span className="lv-btn" aria-hidden="true"><Icon name="play" size={32} active /></span>
          <b>{title}</b>
        </button>
      )}
      <a className="lv-yt" href={watch} target="_blank" rel="noopener noreferrer"><Icon name="out" size={18} />Open in YouTube<span className="lv-sr"> (opens in new tab)</span></a>
    </div>
  )
}

export default LiteVideo
