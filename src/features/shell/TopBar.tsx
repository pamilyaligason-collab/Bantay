import { useEffect, useState } from 'react'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { SyncStatus } from '../sync/SyncStatus'
import { Icon } from './Icon'
import { useOwnAvatar } from '../setup/useProfile'
import './shell.css'

const greeting = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening')
const dateLine = (d: Date) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Manila' }).format(d)

/** Avatar (opens Me), greeting + date, bell (opens the inbox). The place name joins the date line when Task 9's usePlace() lands. */
export function TopBar({ unread = 0 }: { unread?: number }) {
  const [name, setName] = useState('')
  const [admin, setAdmin] = useState(false)
  const photo = useOwnAvatar()
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
  const now = new Date()
  const first = name.split(/\s+/)[0] ?? ''
  return (
    <div className="topbar sh sh-top" data-scrolled={scrolled}>
      <a className="sh-me-btn" href="#me" aria-label="Me and settings">{photo ? <img src={photo} alt="" /> : (first.charAt(0).toUpperCase() || <Icon name="users" />)}</a>
      <div className="sh-top-text">
        <span className="sh-top-date">{dateLine(now)}</span>
        <span className="sh-top-greet">{greeting(now)}{first && `, ${first}`}</span>
        <SyncStatus />
      </div>
      {admin && (
        <a className="sh-iconbtn" href="#admin" aria-label="Admin">
          <Icon name="shield" />
        </a>
      )}
      <a className="sh-iconbtn" href="#notif" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}>
        <Icon name="bell" />
        {unread > 0 && <span className="sh-badge" />}
      </a>
    </div>
  )
}
