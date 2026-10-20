import { useCallback, useEffect, useRef, useState } from 'react'
import AlertsBanner from '../features/notify/AlertsBanner'
import { FAIL_TEXT, checkIn } from '../features/today/actions'
import AlertBand from '../features/today/AlertBand'
import FamilyLine from '../features/today/FamilyLine'
import GreetingBand from '../features/today/GreetingBand'
import MyWeek from '../features/today/MyWeek'
import WeatherCard from '../features/today/WeatherCard'
import NearbyList from '../features/today/NearbyList'
import NextUp from '../features/today/NextUp'
import PlanToday from '../features/today/PlanToday'
import QuickLog from '../features/today/QuickLog'
import SimpleToday from '../features/today/SimpleToday'
import { useKv } from '../features/shell/useKv'
import WeekLine from '../features/today/WeekLine'
import { PwaBanner } from '../features/update/PwaBanner'
import { UpdateCard } from '../features/update/UpdateCard'
import { wireMotion } from '../features/look'
import '../features/today/today.css'

/** Today: warning band (only when one is active), Next up + medicines to check, weather, quick log, My week, family line, today's plan, then More (I'm OK, alerts setup, banners, notices, week line).
 *  News and the video live elsewhere (Safety, Health).
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
  const h1 = <h1 className="td-h1">Today</h1>
  if (!loaded) return h1 // one read of the Simple mode switch, so the full page never flashes first
  if (simple) return <>{h1}<SimpleToday onOk={onOk} notify={notify} />{toast && <div className="toast" role="status">{toast}</div>}</>
  return (
    <div ref={root} className="td-root">
      {h1}
      <AlertBand />
      <NextUp notify={notify} />
      <WeatherCard />
      <QuickLog notify={notify} />
      <MyWeek />
      <FamilyLine />
      <PlanToday />
      {/* More: I'm OK, alerts setup, update and install banners, other notices, the week line. D-50: the update card never sits above a warning. */}
      <GreetingBand onOk={onOk} />
      <AlertsBanner />
      <UpdateCard />
      <PwaBanner />
      <NearbyList />
      <WeekLine />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
