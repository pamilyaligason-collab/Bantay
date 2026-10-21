import { useEffect, useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import './media.css'

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A muted, looping demo clip (MP4/WebM). Starts paused when the phone asks for less motion; Pause/Play button always shown (WCAG 2.2.2). Never plays sound. */
export function AnimatedDemo({ src, label }: { src: string; label: string }) {
  const [playing, setPlaying] = useState(() => !reduced())
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (playing) void v.play?.()?.catch?.(() => setPlaying(false))
    else v.pause?.()
  }, [playing])
  return (
    <figure className="ad">
      <video ref={ref} className="ad-video" src={src} muted loop playsInline autoPlay={playing} aria-label={label} />
      <button type="button" className="ad-toggle" onClick={() => setPlaying((p) => !p)}>
        {playing ? <><Icon name="pause" size={20} />Pause</> : <><Icon name="play" size={20} />Play</>}<span className="lv-sr"> {label}</span>
      </button>
    </figure>
  )
}

export default AnimatedDemo
