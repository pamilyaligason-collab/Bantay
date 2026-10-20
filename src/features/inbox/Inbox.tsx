import { Icon, type IconName } from '../shell/Icon'
import { groupInbox, iconOf, type InboxIcon, type InboxItem } from './build'
import type { Inbox as InboxState } from './useInbox'
import './inbox.css'

const ICON: Record<InboxIcon, IconName> = { alert: 'shield', dose: 'cross', weather: 'bolt', family: 'users', record: 'check', update: 'dl' }

/** Notifications (mockup v6 notif): one tappable row per thing that needs a look. */
export function Inbox({ inbox, now }: { inbox: InboxState; now?: Date }) {
  const seen = new Set(inbox.seen)
  const { today, earlier } = groupInbox(inbox.items, now ?? new Date())
  const group = (label: string, list: InboxItem[]) => list.length === 0 ? null : (
    <section key={label} aria-label={label} data-testid={`inbox-${label.toLowerCase()}`}>
      <h2 className="in-h">{label}</h2>
      <nav className="sh-card sh-list" aria-label={`${label} notifications`}>
        {list.map((i) => (
          <a key={i.id} className={`sh-navrow in-row${seen.has(i.id) ? '' : ' unread'}`} href={i.href} data-icon={iconOf(i)}>
            <Icon name={ICON[iconOf(i)]} />
            <div className="sh-grow"><b>{i.title}</b><div className="sh-sub">{i.sub}</div></div>
            {!seen.has(i.id) && <span className="in-dot" role="img" aria-label="New" />}
            <Icon name="chev" />
          </a>
        ))}
      </nav>
    </section>
  )
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
        <>{group('Today', today)}{group('Earlier', earlier)}</>
      )}
      <p className="sh-sub" style={{ margin: 0 }}>Phone notifications never show readings, medicines or results. Open Bantay to see more.</p>
    </div>
  )
}
