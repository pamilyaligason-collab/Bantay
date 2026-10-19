import { useEffect, useState } from 'react'
import { videoOfTheDay } from './videos'

const useOnline = () => {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

/** Video of the day (D-64): opens YouTube outside Bantay. Hidden when the phone is offline, since the link would go nowhere. */
export default function VideoCard() {
  const on = useOnline()
  if (!on) return null
  const v = videoOfTheDay()
  return (
    <section aria-labelledby="td-vid" data-reveal>
      <div className="td-sech"><h2 id="td-vid">Video of the day</h2><span className="td-sub">new each morning</span></div>
      <a className="card td-video" href={v.url} target="_blank" rel="noopener noreferrer">
        <span className="td-thumb" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
        <span className="td-grow"><b>{v.title}</b><span className="td-sub">{v.source} · {v.note}. Opens YouTube.</span></span>
      </a>
    </section>
  )
}
