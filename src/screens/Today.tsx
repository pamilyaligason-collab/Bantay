import { useCallback, useEffect, useRef, useState } from 'react'
import AlertsBanner from '../features/notify/AlertsBanner'
import NewsTop5 from '../features/safety/NewsTop5'
import MovementCard from '../features/sensors/MovementCard'
import QuickWalk from '../features/sensors/QuickWalk'
import { FAIL_TEXT, checkIn, takeDose } from '../features/today/actions'
import Hero from '../features/today/Hero'
import NearbyList from '../features/today/NearbyList'
import QuickLog from '../features/today/QuickLog'
import SetupCard from '../features/today/SetupCard'
import SimpleToday from '../features/today/SimpleToday'
import { useKv } from '../features/shell/useKv'
import VideoCard from '../features/today/VideoCard'
import { PwaBanner } from '../features/update/PwaBanner'
import { UpdateCard } from '../features/update/UpdateCard'
import '../features/today/today.css'

/** Today (mockup v6): quick-log row, the one hero card, update and setup, nearby notices, news, video, movement.
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
  const onOk = useCallback(() => { void checkIn().then((r) => notify(r === 'ok' ? 'Family sees: I am OK' : FAIL_TEXT[r])) }, [notify])
  const onTaken = useCallback((name: string) => { void takeDose(name).then((r) => notify(r === 'ok' ? `Marked ${name} taken` : FAIL_TEXT[r])) }, [notify])
  const h1 = <h1 className="td-h1">Today</h1>
  if (!loaded) return h1 // one read of the Simple mode switch, so the full page never flashes first
  if (simple) return <>{h1}<SimpleToday onOk={onOk} onTaken={onTaken} />{toast && <div className="toast" role="status">{toast}</div>}</>
  return (
    <>
      <PwaBanner />
      {h1}
      <QuickLog notify={notify} onOk={onOk} />
      <Hero onOk={onOk} onTaken={onTaken} />
      {/* D-50: the update card never sits above a warning; the hero alert comes first. */}
      <UpdateCard />
      <SetupCard />
      <AlertsBanner />
      <NearbyList />
      <section aria-labelledby="t-news"><h2 id="t-news" className="td-sech">News</h2><NewsTop5 /></section>
      <VideoCard />
      <MovementCard />
      <QuickWalk />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
