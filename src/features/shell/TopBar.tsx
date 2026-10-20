import { useEffect, useState } from 'react'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { usePlace } from '../location/useLocation'
import { placeNameOf } from '../today/placeName'
import { SyncStatus } from '../sync/SyncStatus'
import { Icon } from './Icon'
import { parseHash } from './routes'
import { useOwnAvatar } from '../setup/useProfile'
import './shell.css'

const greeting = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening')
const dateLine = (d: Date) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Manila' }).format(d)

/** Capitalised first name: the family list may hold 'loyd'. */
export const firstName = (full: string) => { const f = full.trim().split(/\s+/)[0] ?? ''; return f.charAt(0).toUpperCase() + f.slice(1) }
/** Sub-pages (a metric, a Safety page, a person, Medical ID, Go-bag, Documents) draw their own header, so the band shrinks. */
export const isSubHash = (h: string) => {
  const k = h.replace(/^#/, '')
  return k === 'medid' || k === 'gobag' || k === 'docs' || (k.includes('/') && !/^family\/(plan|people)$/.test(k))
}
/** The greeting and date belong to Today only; every other tab and sub-page shows its own title. */
export const isTodayHash = (h: string) => { const r = parseHash(h); return r.tab === 'today' && r.view === null }
// A key: tells the admin door apart from the Safety shield.
const ADMIN_PATH = 'M7.5 8a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM11 11.5h10M18 11.5v3M15 11.5v2'

/** Avatar (opens Me), greeting + date, bell (opens the inbox). The place name joins the date line once known. */
export function TopBar({ unread = 0 }: { unread?: number }) {
  const [name, setName] = useState('')
  const [admin, setAdmin] = useState(false)
  const photo = useOwnAvatar()
  const place = usePlace()
  const where = place && placeNameOf(place)
  useEffect(() => {
    let live = true
    void getMember().then((m) => {
      const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''
      if (live && n) setName(n)
      if (live) setAdmin(m?.role === 'admin')
    })
    return () => { live = false }
  }, [])
  // Glass only once content has scrolled under the bar (D-71). Scroll events do not bubble, so listen in the capture phase.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = (e: Event) => { const t = e.target as HTMLElement | null; if (t?.matches?.('main.scroll')) setScrolled(t.scrollTop > 4) }
    document.addEventListener('scroll', on, true)
    return () => document.removeEventListener('scroll', on, true)
  }, [])
  const [sub, setSub] = useState(() => isSubHash(location.hash))
  useEffect(() => {
    const on = () => setSub(isSubHash(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [today, setToday] = useState(() => isTodayHash(location.hash))
  useEffect(() => {
    const on = () => setToday(isTodayHash(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const now = new Date()
  const first = firstName(name)
  return (
    <div className="topbar sh sh-top" data-scrolled={scrolled} data-compact={scrolled || sub || !today}>
      <a className="sh-me-btn" href="#me" aria-label="Me and settings">{photo ? <img src={photo} alt="" /> : (first.charAt(0) || <Icon name="users" />)}</a>
      <div className="sh-top-text">
        {today && <span className="sh-top-date">{dateLine(now)}{where && where !== 'where you are' && ` · ${where}`}</span>}
        {today && <span className="sh-top-greet">{greeting(now)}{first && `, ${first}`}</span>}
        <SyncStatus />
      </div>
      {admin && (
        <a className="sh-iconbtn" href="#admin" aria-label="Admin">
          <svg className="sh-ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ADMIN_PATH} /></svg>
        </a>
      )}
      <a className="sh-iconbtn" href="#notif" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}>
        <Icon name="bell" />
        {unread > 0 && <span className="sh-badge" />}
      </a>
    </div>
  )
}
