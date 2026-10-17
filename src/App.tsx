import { useEffect, useRef, useState } from 'react'
import { PullIndicator, requestRefresh, Sky, springIn, usePullToRefresh, useSwipe } from './features/look'
import Family from './screens/Family'
import Health from './screens/Health'
import Records from './screens/Records'
import Safety from './screens/Safety'
import Today from './screens/Today'
import Assistant from './features/assistant/Assistant'
import { startSync } from './features/sync/sync'
import { SyncStatus } from './features/sync/SyncStatus'
import { AdminScreen, useTrackScreen } from './features/admin'
import { getMember, onAuthChange } from './features/auth/session'

// Tab icons and order copied from the prototype tab bar.
const SHIELD = 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'
const TABS = [
  { id: 'today', label: 'Today', Screen: Today, icon: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'health', label: 'Health', Screen: Health, icon: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z' },
  { id: 'records', label: 'Records', Screen: Records, icon: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6' },
  { id: 'family', label: 'Family', Screen: Family, icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M16 15c3 0 5 2 5 5' },
  { id: 'safety', label: 'Safety', Screen: Safety, icon: SHIELD }
] as const

const fromHash = () => TABS.find((t) => t.id === location.hash.slice(1)) ?? TABS[0]

export default function App() {
  const [tab, setTab] = useState(fromHash)
  const [hash, setHash] = useState(location.hash)
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    const check = () => void getMember().then((m) => setIsAdmin(m?.role === 'admin'))
    check()
    return onAuthChange(check)
  }, [])
  useEffect(() => {
    const on = () => { setTab(fromHash()); setHash(location.hash) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const idx = TABS.findIndex((t) => t.id === tab.id)
  const swiped = useRef(false)
  // Swipes replace the history entry so Back does not step through every tab.
  const go = (i: number) => { const t = TABS[i]; if (t) { swiped.current = true; location.replace('#' + t.id) } }
  const swipe = useSwipe<HTMLElement>({ onLeft: () => go(idx + 1), onRight: () => go(idx - 1) })
  const ptr = usePullToRefresh<HTMLElement>(requestRefresh, tab.id === 'today' || tab.id === 'safety')
  const scroll = useRef<HTMLElement | null>(null)
  const prev = useRef(idx)
  const adminRoute = hash === '#admin' && isAdmin // server RLS/RPCs still enforce is_admin()
  useTrackScreen(adminRoute ? 'admin' : tab.id)
  useEffect(() => startSync(), []) // inside AuthGate; returns its stop fn; no-op until signed in
  useEffect(() => { document.title = `${tab.label} - Family Bantay` }, [tab])
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

  return (
    <div className="bt">
      <Sky state="clear" />
      <div className="topbar"><SyncStatus />{isAdmin && <a className="admin-link" href="#admin">Admin</a>}</div>
      <main className="scroll" ref={(el) => { scroll.current = el; swipe.current = el; ptr.ref.current = el }}>
        <PullIndicator indicator={ptr.indicator} refreshing={ptr.refreshing} armed={ptr.armed} />
        {adminRoute ? <AdminScreen /> : <tab.Screen />}
      </main>
      <nav aria-label="Main" className="glass tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-current={t.id === tab.id ? 'page' : 'false'} onClick={() => { location.hash = t.id }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
      <Assistant />
    </div>
  )
}
