import { useCallback, useEffect, useRef, useState } from 'react'
import AlertsBanner from '../features/notify/AlertsBanner'
import { AlertCardToday } from '../features/notify/AlertCardToday'
import { AlarmFixedToast } from '../features/phonecheck/AlarmFixedToast'
import { IncomingSos } from '../features/family/IncomingSos'
import { StormCard } from '../features/safety/StormCard'
import AlertBand from '../features/today/AlertBand'
import SelfCare from '../features/today/SelfCare'
import SeeWeek from '../features/today/SeeWeek'
import WeatherCard from '../features/today/WeatherCard'
import NearbyList from '../features/today/NearbyList'
import NextUp from '../features/today/NextUp'
import { useNext } from '../features/today/useNext'
import { useSnoozed } from '../features/today/useSnoozed'
import PlanToday from '../features/today/PlanToday'
import QuickLog from '../features/today/QuickLog'
import SimpleToday from '../features/today/SimpleToday'
import { useKv } from '../features/shell/useKv'
import SosHold from '../features/sos/SosHold'
import SosScreen from '../features/sos/SosScreen'
import { retryToast, retryUnsentMood } from '../features/today/actions'
import WeekLine from '../features/today/WeekLine'
import { PwaBanner } from '../features/update/PwaBanner'
import { UpdateCard } from '../features/update/UpdateCard'
import { Skeleton, wireMotion } from '../features/look'
import type { NextItem } from '../features/today/nextPick'
import '../features/today/today.css'

/** Today: warning band (only when one is active), weather (greeting, bell and M live in the top bar), the newest family alert, Next up + medicines to check (none when nothing is next: the weather card expands instead), quick log (How are you? is the check-in; one salt line under it, Meals live in Health > Food), self-care breathing, today's plan, the See the week link (My week opens under it), then More (alerts setup, banners, notices, week line).
 *  News and the video live elsewhere (Safety, Health).
 *  The greeting and date live in the top bar, so the page heading is for screen readers only. */
export default function Today() {
  const [simple, setSimple, loaded] = useKv<boolean>('mode.simple', false)
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
  useEffect(() => { // Simple mode hides the tab bar and its coach mark (CSS on .bt[data-simple]) so SOS is never under them
    const bt = document.querySelector('.bt')
    if (!loaded || !simple || !bt) return
    bt.setAttribute('data-simple', '')
    return () => bt.removeAttribute('data-simple')
  }, [loaded, simple])
  const [sos, setSos] = useState(false)
  useEffect(() => { // an Unwell saved offline is sent when Today opens and when the phone is back online (the server keeps one per day)
    const go = () => { void retryUnsentMood().then((r) => { const t = retryToast(r); if (t) notify(t) }, () => undefined) }
    go()
    window.addEventListener('online', go)
    return () => window.removeEventListener('online', go)
  }, [notify])
  const next = useNext()
  const [held, setHeld] = useState<NextItem | null>(null) // the dose card stays up while its take is saved and the done-morph plays (NextUp frees it)
  const item = held ?? next.item
  const calm = item.kind === 'calm' // nothing next: no Next up card, the weather card takes its place
  const snoozed = useSnoozed(item.key) // "In 10 min" on the late dose card hides it until then
  const h1 = <h1 className="td-h1">Today</h1>
  if (!loaded) return ( // one read of the Simple mode switch, so the full page never flashes first
    <section className="td-root" aria-busy="true">{h1}<span className="td-vh">Loading</span><Skeleton lines={4} /><Skeleton lines={2} /></section>
  )
  if (sos) return <SosScreen onClose={() => setSos(false)} /> // the same hold-to-send flow as Simple mode and the Safety tab
  if (simple) return <>{h1}<SimpleToday onExit={() => setSimple(false)} notify={notify} />{toast && <div className="toast" role="status">{toast}</div>}</>
  return (
    <div ref={root} className="td-root">
      {h1}
      <AlarmFixedToast />
      <IncomingSos placement="today" />
      <AlertBand />
      <StormCard />
      <WeatherCard expanded={calm} review={next.review} />
      <AlertCardToday />
      {!calm && !snoozed && <NextUp key={`${item.key}|${(item.who?.slots ?? []).map((x) => x.key).sort().join(',')}`} item={item} review={next.review} notify={notify} hold={setHeld} />}
      <QuickLog notify={notify} />
      {/* SOS sits mid-page on purpose: the Jack button floats at the bottom (--tabbar-clear) and must never cover it. */}
      <section className="td-sos" aria-label="Emergency"><SosHold onSend={() => setSos(true)} /></section>
      <SelfCare />
      <PlanToday />
      <SeeWeek />
      {/* More: alerts setup, update and install banners, other notices, the week line. D-50: the update card never sits above a warning. */}
      <div className="td-more-g" role="group" aria-labelledby="t-more">
        <h2 id="t-more" className="td-more-h">More</h2>
        <AlertsBanner />
        <UpdateCard />
        <PwaBanner />
        <NearbyList />
        <WeekLine />
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
