import { Icon, type IconName } from '../shell/Icon'
import type { InboxKind } from './build'
import type { Inbox as InboxState } from './useInbox'
import './inbox.css'

const ICON: Record<InboxKind, IconName> = { alert: 'shield', dose: 'cross', pin: 'users', records: 'check', update: 'dl' }

/** Notifications (mockup v6 notif): one tappable row per thing that needs a look. */
export function Inbox({ inbox }: { inbox: InboxState }) {
  const seen = new Set(inbox.seen)
  return (
    <div className="sh sh-me">
      <div className="sh-row">
        <a className="sh-iconbtn" href="#today" aria-label="Back to Today"><Icon name="back" /></a>
        <h1 className="sh-h2 sh-grow">Notifications</h1>
        {inbox.unread > 0 && <button type="button" className="in-read" onClick={inbox.markAllRead}>Mark all read</button>}
      </div>
      {inbox.items.length === 0 ? (
        <div className="sh-card"><b>No notifications yet</b><p className="sh-sub" style={{ margin: '4px 0 0' }}>Warnings, medicine reminders and updates show here.</p></div>
      ) : (
        <nav className="sh-card sh-list" aria-label="Notifications">
          {inbox.items.map((i) => (
            <a key={i.id} className={`sh-navrow in-row${seen.has(i.id) ? '' : ' unread'}`} href={i.href}>
              <Icon name={ICON[i.kind]} />
              <div className="sh-grow"><b>{i.title}</b><div className="sh-sub">{i.sub}</div></div>
              {!seen.has(i.id) && <span className="in-dot" role="img" aria-label="New" />}
              <Icon name="chev" />
            </a>
          ))}
        </nav>
      )}
      <p className="sh-sub" style={{ margin: 0 }}>Notifications never show readings, medicines or results. Open Bantay to see more.</p>
    </div>
  )
}
