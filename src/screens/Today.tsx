import { useCallback, useEffect, useRef, useState } from 'react'
import AlertsBanner from '../features/notify/AlertsBanner'
import NewsTop5 from '../features/safety/NewsTop5'
import MovementCard from '../features/sensors/MovementCard'
import QuickWalk from '../features/sensors/QuickWalk'
import { FAIL_TEXT, checkIn, takeDose } from '../features/today/actions'
import GreetingBand from '../features/today/GreetingBand'
import Hero from '../features/today/Hero'
import NearbyList from '../features/today/NearbyList'
import QuickLog from '../features/today/QuickLog'
import StormCard from '../features/today/StormCard'
import SetupCard from '../features/today/SetupCard'
import SimpleToday from '../features/today/SimpleToday'
import { useKv } from '../features/shell/useKv'
import VideoCard from '../features/today/VideoCard'
import WeatherStrip from '../features/today/WeatherStrip'
import { PwaBanner } from '../features/update/PwaBanner'
import { UpdateCard } from '../features/update/UpdateCard'
import { wireMotion } from '../features/look'
import '../features/today/today.css'

/** Today: I'm OK band, Next up hero, quick log, Your day, weather strip, notices, video, news (only with items).
 *  The greeting and date live in the top bar, so the page heading is for screen readers only. */
export default function Today() {
  const [simple, , loaded] = useKv<boolean>('mode.simple', false)
  const [toast, setToast] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const notify = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 3500)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => (loaded && !simple ? wireMotion(root.current) : undefined), [loaded, simple]) // [data-reveal] sections; none on SOS, 911 or the I'm OK confirmation
  const onOk = useCallback(() => { void checkIn().then((r) => notify(r === 'ok' ? 'Family sees: I am OK' : FAIL_TEXT[r])) }, [notify])
  const onTaken = useCallback((name: string) => { void takeDose(name).then((r) => notify(r === 'ok' ? `Marked ${name} taken` : FAIL_TEXT[r])) }, [notify])
  const h1 = <h1 className="td-h1">Today</h1>
  if (!loaded) return h1 // one read of the Simple mode switch, so the full page never flashes first
  if (simple) return <>{h1}<SimpleToday onOk={onOk} onTaken={onTaken} />{toast && <div className="toast" role="status">{toast}</div>}</>
  return (
    <div ref={root} className="td-root">
      <PwaBanner />
      {h1}
      <GreetingBand onOk={onOk} />
      <section aria-labelledby="t-next">
        <h2 id="t-next" className="td-sech">Next up</h2>
        <Hero next onOk={onOk} onTaken={onTaken} />
      </section>
      {/* D-50: the update card never sits above a warning; the hero alert comes first. */}
      <UpdateCard />
      <SetupCard />
      <AlertsBanner />
      <QuickLog notify={notify} />
      <section className="card td-day" aria-labelledby="t-day" data-reveal>
        <h2 id="t-day" className="td-sech">Your day</h2>
        <MovementCard embedded />
        <QuickWalk embedded />
      </section>
      <WeatherStrip />
      <StormCard />
      <NearbyList />
      <VideoCard />
      <NewsTop5 hideEmpty />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
