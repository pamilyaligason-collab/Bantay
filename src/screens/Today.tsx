import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCardToday } from '../features/notify/AlertCardToday'
import { AlarmFixedToast } from '../features/phonecheck/AlarmFixedToast'
import { IncomingSos } from '../features/family/IncomingSos'
import WeatherCard from '../features/today/WeatherCard'
import NoticeStack, { AlertsOffCard } from '../features/today/NoticeStack'
import WarningCard, { useWarnings } from '../features/today/WarningCard'
import SimpleToday from '../features/today/SimpleToday'
import { useKv } from '../features/shell/useKv'
import { retryToast, retryUnsentMood } from '../features/today/actions'
import { LargeTitle, Skeleton, wireMotion } from '../features/look'
import MyDay from '../features/today/MyDay'
import CalmCard from '../features/today/CalmCard'
import TodayNews from '../features/today/TodayNews'
import Lotto from '../features/today/Lotto'
import FxCard from '../features/today/FxCard'
import PricesCard from '../features/today/PricesCard'
import { PlantCard } from '../features/garden/Plant'
import { useGardenPage } from '../features/garden/pages'
import { TalkCard } from '../features/calm/CrisisCard'
import BatteryCard from '../features/today/BatteryCard'
import YourNumbers from '../features/today/YourNumbers'
import { dateKicker, greeting } from '../features/today/greeting'
import { HeadActions } from '../features/shell/HeadActions'
import { getMember } from '../features/auth/session'
import { loadFamily } from '../features/auth/family'
import { useActing } from '../features/viewas/viewAs'
import PlaceNotice from '../features/family/PlaceNotice'
import '../features/today/today.css'

/** Today: warning band (only when one is active), weather (greeting, bell and M live in the top bar), the newest family alert, Next up + medicines to check (none when nothing is next: the weather card expands instead), My day (How are you? opens the mood faces, Log something else opens More, breathing, the plan, a missed medicine of someone else), Calm, Your numbers, News (up to 5 headlines, health and weather first, hidden when none are fresh) and Lotto results (latest PCSO draws, hidden when none; both below Your numbers), then More (alerts setup, banners, notices).
 *  The video lives in Health; all news is Discover > News (D-142).
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
  useEffect(() => { // an Unwell saved offline is sent when Today opens and when the phone is back online (the server keeps one per day)
    const go = () => { void retryUnsentMood().then((r) => { const t = retryToast(r); if (t) notify(t) }, () => undefined) }
    go()
    window.addEventListener('online', go)
    return () => window.removeEventListener('online', go)
  }, [notify])
  const warn = useWarnings()
  const [name, setName] = useState('')
  const viewing = useActing() // an admin viewing as someone: the greeting names that person; the avatar stays the admin's own (it opens the admin's settings)
  useEffect(() => {
    let live = true
    void getMember().then((m) => { const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''; if (live && n) setName(n) })
    return () => { live = false }
  }, [])
  const garden = useGardenPage() // #garden/plant and #garden/prices replace the page
  const h1 = <h1 className="td-h1">Today</h1>
  if (garden) return <>{garden}</>
  if (!loaded) return ( // one read of the Simple mode switch, so the full page never flashes first
    <section className="td-root" aria-busy="true">{h1}<span className="td-vh">Loading</span><Skeleton lines={4} /><Skeleton lines={2} /></section>
  )
  if (simple) return <>{h1}<SimpleToday onExit={() => setSimple(false)} notify={notify} />{toast && <div className="toast" role="status">{toast}</div>}</>
  return (
    <div ref={root} className="td-root">
      <LargeTitle testId="today-head" kicker={dateKicker(new Date())} title={greeting(new Date(), viewing.acting ? viewing.name : name)} actions={<HeadActions />} />
      <AlarmFixedToast />
      <IncomingSos placement="today" />
      <WeatherCard hero expanded review={0} noJack storm={!!warn.storm} />
      <AlertsOffCard />
      <WarningCard notify={notify} />
      <AlertCardToday />
      <PlaceNotice />
      <TalkCard />
      <MyDay notify={notify} />
      <BatteryCard />
      <CalmCard />
      <YourNumbers />
      <TodayNews /><PricesCard /><PlantCard /><FxCard /><Lotto />
      {/* More: setup, update and install rows, nearby, the week line. D-50: the update row never sits above a warning. */}
      <NoticeStack />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
