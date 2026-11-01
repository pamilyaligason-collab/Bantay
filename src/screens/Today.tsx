import { useCallback, useContext, useEffect, useRef, useState } from 'react'
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
import QuickLog from '../features/today/QuickLog'
import MyDay from '../features/today/MyDay'
import CalmCard from '../features/today/CalmCard'
import YourNumbers from '../features/today/YourNumbers'
import { dateKicker, greeting } from '../features/today/greeting'
import { UnreadContext } from '../features/today/unread'
import { Icon } from '../features/shell/Icon'
import { firstName } from '../features/shell/TopBar'
import { useOwnAvatar } from '../features/setup/useProfile'
import { getMember } from '../features/auth/session'
import { loadFamily } from '../features/auth/family'
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
  useEffect(() => { // an Unwell saved offline is sent when Today opens and when the phone is back online (the server keeps one per day)
    const go = () => { void retryUnsentMood().then((r) => { const t = retryToast(r); if (t) notify(t) }, () => undefined) }
    go()
    window.addEventListener('online', go)
    return () => window.removeEventListener('online', go)
  }, [notify])
  const warn = useWarnings()
  const unread = useContext(UnreadContext)
  const photo = useOwnAvatar()
  const [name, setName] = useState('')
  useEffect(() => {
    let live = true
    void getMember().then((m) => { const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''; if (live && n) setName(n) })
    return () => { live = false }
  }, [])
  const h1 = <h1 className="td-h1">Today</h1>
  if (!loaded) return ( // one read of the Simple mode switch, so the full page never flashes first
    <section className="td-root" aria-busy="true">{h1}<span className="td-vh">Loading</span><Skeleton lines={4} /><Skeleton lines={2} /></section>
  )
  if (simple) return <>{h1}<SimpleToday onExit={() => setSimple(false)} notify={notify} />{toast && <div className="toast" role="status">{toast}</div>}</>
  return (
    <div ref={root} className="td-root">
      <LargeTitle testId="today-head" kicker={dateKicker(new Date())} title={greeting(new Date(), name)} actions={<>
        <a className="td-bell" href="#notif" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}><Icon name="bell" size={22} />{unread > 0 && <span className="td-bell-dot" />}</a>
        <a className="td-me" href="#me" aria-label="You and settings">{photo ? <img src={photo} alt="" /> : (firstName(name).charAt(0) || <Icon name="users" size={20} />)}</a>
      </>} />
      <AlarmFixedToast />
      <IncomingSos placement="today" />
      <WeatherCard hero expanded review={0} noJack storm={!!warn.storm} />
      <AlertsOffCard />
      <WarningCard notify={notify} />
      <AlertCardToday />
      <MyDay notify={notify} />
      <CalmCard />
      <YourNumbers />
      <QuickLog notify={notify} /> {/* kept: the mood faces (Unwell reaches the family) and Move/Salt have no other home on Today */}
      {/* More: setup, update and install rows, nearby, the week line. D-50: the update row never sits above a warning. */}
      <NoticeStack />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
