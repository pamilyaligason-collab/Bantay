import { useEffect, useRef, useState, type ComponentType } from 'react'
import { PullIndicator, requestRefresh, Sky, springIn, usePullToRefresh, useSwipe } from './features/look'
import Family from './screens/Family'
import Health from './screens/Health'
import Me from './screens/Me'
import Safety from './screens/Safety'
import Today from './screens/Today'
import Assistant from './features/assistant/Assistant'
import { startSync } from './features/sync/sync'
import { AdminScreen, useTrackScreen } from './features/admin'
import { getMember, onAuthChange } from './features/auth/session'
import { parseHash, TABS, type Tab } from './features/shell/routes'
import { Icon } from './features/shell/Icon'
import { TabBar } from './features/shell/TabBar'
import { useSavedTheme } from './features/shell/theme'
import { TopBar } from './features/shell/TopBar'
import { useKv } from './features/shell/useKv'
import { RequiresUpdate } from './features/update/RequiresUpdate'
import { UpdatedToast } from './features/update/UpdatedToast'
import { useUpdateCheckOnOpen } from './features/update/useUpdate'

const SCREENS: Record<Tab, { label: string; Screen: ComponentType }> = {
  today: { label: 'Today', Screen: Today },
  health: { label: 'Health', Screen: Health },
  family: { label: 'Family', Screen: Family },
  safety: { label: 'Safety', Screen: Safety }
}

function Notifications() {
  return (
    <div className="sh sh-me">
      <div className="sh-row">
        <a className="sh-iconbtn" href="#today" aria-label="Back to Today"><Icon name="back" /></a>
        <h1 className="sh-h2">Notifications</h1>
      </div>
      <div className="sh-card"><b>No notifications yet</b><p className="sh-sub" style={{ margin: '4px 0 0' }}>The inbox arrives in a later update.</p></div>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  const [hash, setHash] = useState(location.hash)
  const [isAdmin, setIsAdmin] = useState(false)
  const [unread] = useKv<number>('notif.unread', 0)
  useSavedTheme()
  useUpdateCheckOnOpen()
  useEffect(() => {
    const check = () => void getMember().then((m) => setIsAdmin(m?.role === 'admin'))
    check()
    return onAuthChange(check)
  }, [])
  useEffect(() => {
    const on = () => { setRoute(parseHash(location.hash)); setHash(location.hash) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Me, notifications and admin are full views with no active tab; swipe and pull-to-refresh belong to the four tabs.
  const view = route.view === 'admin' && !isAdmin ? null : route.view
  const isTabView = !(view === 'me' || view === 'notif' || view === 'admin')
  const tab: Tab = route.tab ?? 'today'
  const idx = TABS.indexOf(tab)
  const swiped = useRef(false)
  // Swipes replace the history entry so Back does not step through every tab.
  const go = (i: number) => { const t = TABS[i]; if (t && isTabView) { swiped.current = true; location.replace('#' + t) } }
  const swipe = useSwipe<HTMLElement>({ onLeft: () => go(idx + 1), onRight: () => go(idx - 1) })
  const ptr = usePullToRefresh<HTMLElement>(requestRefresh, isTabView && (tab === 'today' || tab === 'safety'))
  const scroll = useRef<HTMLElement | null>(null)
  const prev = useRef(idx)
  useTrackScreen(isTabView ? (hash === '#records' ? 'records' : tab) : view!)
  useEffect(() => startSync(), []) // inside AuthGate; returns its stop fn; no-op until signed in
  const title = view === 'me' ? 'Me' : view === 'notif' ? 'Notifications' : view === 'admin' ? 'Admin' : SCREENS[tab].label
  useEffect(() => { document.title = `${title} - Family Bantay` }, [title])
  useEffect(() => {
    const el = scroll.current
    if (!el || prev.current === idx) return
    el.scrollTop = 0
    springIn(el, idx > prev.current ? 1 : -1)
    prev.current = idx
    if (swiped.current) {
      swiped.current = false
      const h1 = el.querySelector('h1')
      if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }) }
    }
  }, [idx])

  const Tabbed = SCREENS[tab].Screen
  return (
    <div className="bt">
      <Sky state="clear" />
      {isTabView && <TopBar unread={unread} />}
      <main className="scroll" ref={(el) => { scroll.current = el; swipe.current = el; ptr.ref.current = el }}>
        <PullIndicator indicator={ptr.indicator} refreshing={ptr.refreshing} armed={ptr.armed} />
        {view === 'admin' ? <AdminScreen /> : view === 'me' ? <Me /> : view === 'notif' ? <Notifications /> : <Tabbed />}
      </main>
      <TabBar active={isTabView ? tab : null} />
      <Assistant />
      <RequiresUpdate />
      <UpdatedToast />
    </div>
  )
}
