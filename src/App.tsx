import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import { PullIndicator, requestRefresh, Sky, springIn, usePullToRefresh, useSwipe } from './features/look'
import Discover from './screens/Discover'
import Family from './screens/Family'
import Health from './screens/Health'
import Me from './screens/Me'
import Safety from './screens/Safety'
import Today from './screens/Today'
import Assistant from './features/assistant/Assistant'
import { startSync } from './features/sync/sync'
import { watchAlertsForSession } from './features/notify/alertsLive'
import { watchDoseReminders } from './features/health/reminders'
import { AdminScreen, useTrackScreen } from './features/admin'
import { webAdminUrl } from './features/admin/desk/types'
import { DocsScreen } from './features/docs/DocsScreen'
import WeatherScreen from './features/weather/WeatherScreen'
import PrivacyScreen from './features/privacy/PrivacyScreen'
import { getMember, onAuthChange } from './features/auth/session'
import { canonicalHash, hasOwnHeader, parseHash, TABS, type Tab } from './features/shell/routes'
import { Inbox } from './features/inbox/Inbox'
import { useInbox } from './features/inbox/useInbox'
import { TabBar } from './features/shell/TabBar'
import { JackFab } from './features/shell/JackFab'
import { isDiscoverSubRoot } from './features/discover'
import ApprovePinSheet from './features/setup/ApprovePinSheet'
import { useSavedTheme } from './features/shell/theme'
import { useSavedTextSize } from './features/shell/textSize'
import { TopBar } from './features/shell/TopBar'
import { OfflineBar } from './features/sync/OfflineBar'
import ViewAsBanner from './features/viewas/ViewAsBanner'
import { loadLang } from './lib/i18n'
import { RequiresUpdate } from './features/update/RequiresUpdate'
import { watchPushForSession } from './features/notify/fcm'
import { UpdatedToast } from './features/update/UpdatedToast'
import { useUpdateCheckOnOpen } from './features/update/useUpdate'

const ScanFlow = lazy(() => import('./features/scan/ScanFlow')) // camera, crop and the scanner plugin load only when someone scans

const SharingScreen = lazy(() => import('./features/sharing/SharingScreen'))

const SCREENS: Record<Tab, { label: string; Screen: ComponentType }> = {
  today: { label: 'Today', Screen: Today },
  health: { label: 'Health', Screen: Health },
  discover: { label: 'Discover', Screen: Discover },
  family: { label: 'Family', Screen: Family },
  safety: { label: 'Safety', Screen: Safety }
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  const [hash, setHash] = useState(location.hash)
  const [isAdmin, setIsAdmin] = useState(false)
  const inbox = useInbox(isAdmin)
  useSavedTheme()
  useSavedTextSize()
  useUpdateCheckOnOpen()
  useEffect(() => {
    const check = () => void getMember().then((m) => setIsAdmin(m?.role === 'admin'))
    check()
    return onAuthChange(check)
  }, [])
  useEffect(() => {
    const on = () => {
      const w = webAdminUrl(location.hash)
      if (w) { location.replace(w); return } // the dashboard moved to its own page, /admin
      const c = canonicalHash(location.hash)
      if (c !== location.hash) { location.replace(c); return } // moved links (#records, #health/library, #family/people ...) land on their new screen (C-3)
      setRoute(parseHash(location.hash)); setHash(location.hash)
    }
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Me, notifications and admin are full views with no active tab; swipe and pull-to-refresh belong to the four tabs.
  const view = route.view === 'admin' && !isAdmin ? null : route.view
  const isTabView = !(view === 'me' || view === 'notif' || view === 'admin' || view === 'scan' || view === 'sharing')
  const tab: Tab = route.tab ?? 'today'
  const idx = TABS.indexOf(tab)
  const swiped = useRef(false)
  // Swipes replace the history entry so Back does not step through every tab.
  const go = (i: number) => { const t = TABS[i]; if (t && isTabView) { swiped.current = true; location.replace('#' + t) } }
  const swipe = useSwipe<HTMLElement>({ onLeft: () => go(idx + 1), onRight: () => go(idx - 1) })
  const ptr = usePullToRefresh<HTMLElement>(requestRefresh, isTabView && (tab === 'today' || tab === 'safety'))
  const scroll = useRef<HTMLElement | null>(null)
  const prev = useRef(idx)
  useTrackScreen(view === 'docs' ? 'docs' : view === 'weather' ? 'today' : isTabView ? (hash === '#family/papers' ? 'records' : tab) : view!)
  useEffect(() => startSync(), []) // inside AuthGate; returns its stop fn; no-op until signed in
  useEffect(() => watchAlertsForSession(), []) // family alerts (D-78): Realtime + poll while open; stops on sign-out
  useEffect(() => watchPushForSession(), []) // FCM push to the APK (E): registers the token, polls alerts on a foreground push; stops on sign-out
  useEffect(() => { void loadLang() }, []) // the saved language (kv `lang`) becomes the one t() uses
  useEffect(() => watchDoseReminders(), []) // keeps dose reminders in step with the medications table
  const title = view === 'me' ? 'Me' : view === 'notif' ? 'Notifications' : view === 'admin' ? 'Admin' : view === 'scan' ? 'Scan & Capture' : view === 'weather' ? 'Weather' : view === 'sharing' ? 'Sharing' : SCREENS[tab].label
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
      {isTabView && (!hasOwnHeader(hash) || isDiscoverSubRoot(hash)) && <TopBar unread={inbox.unread} />}
      <OfflineBar />
      <ViewAsBanner />
      <main className="scroll" ref={(el) => { scroll.current = el; swipe.current = el; ptr.ref.current = el }}>
        <PullIndicator indicator={ptr.indicator} refreshing={ptr.refreshing} armed={ptr.armed} />
        {view === 'admin' ? <AdminScreen /> : view === 'scan' ? <Suspense fallback={null}><ScanFlow /></Suspense> : view === 'me' ? <Me /> : view === 'notif' ? <Inbox inbox={inbox} /> : view === 'docs' ? <DocsScreen /> : view === 'weather' ? <WeatherScreen /> : view === 'privacy' ? <PrivacyScreen /> : view === 'sharing' ? <Suspense fallback={null}><SharingScreen /></Suspense> : <Tabbed />}
      </main>
      <TabBar active={isTabView ? tab : null} />
      <JackFab tab={isTabView ? tab : null} hash={hash} />
      <Assistant />
      <ApprovePinSheet />
      <RequiresUpdate />
      <UpdatedToast />
    </div>
  )
}
