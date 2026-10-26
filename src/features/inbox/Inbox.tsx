import { Icon, type IconName, type IconTone } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { groupInbox, iconOf, type InboxIcon, type InboxItem } from './build'
import { MissedDoseActions } from './MissedDoseActions'
import type { Inbox as InboxState } from './useInbox'
import './inbox.css'

const ICON: Record<InboxIcon, IconName> = { alert: 'warn', dose: 'pill', weather: 'cloud', family: 'shield', record: 'shield', update: 'shield' }
const TONE: Record<InboxIcon, IconTone> = { alert: 'alert', dose: 'medicine', weather: 'weather', family: 'safety', record: 'safety', update: 'safety' }

/** Notifications (mockup v6 notif): one tappable row per thing that needs a look. */
export function Inbox({ inbox, now }: { inbox: Omit<InboxState, 'openRow'> & { openRow?: InboxState['openRow'] }; now?: Date }) {
  const seen = new Set(inbox.seen)
  const isNew = (i: InboxItem) => (i.seen === undefined ? !seen.has(i.id) : !i.seen)
  const { today, earlier } = groupInbox(inbox.items, now ?? new Date())
  const group = (label: string, list: InboxItem[]) => list.length === 0 ? null : (
    <section key={label} aria-label={label} data-testid={`inbox-${label.toLowerCase()}`}>
      <h2 className="in-h">{label}</h2>
      <nav className="sh-card sh-list" aria-label={`${label} notifications`}>
        {list.map((i) => (
          <div key={i.id} className="in-item" data-tone={i.tone}>
            <a className={`sh-navrow in-row${isNew(i) ? ' unread' : ''}`} href={i.href} data-icon={iconOf(i)} onClick={() => { if (i.row) inbox.openRow?.(i.row.id) }}>
              <Icon name={ICON[iconOf(i)]} tone={i.tone === 'urgent' && i.kind === 'family' ? 'alert' : TONE[iconOf(i)]} boxed size={20} />
              <div className="sh-grow"><b>{i.title}</b><div className="sh-sub">{i.sub}</div></div>
              {isNew(i) && <span className="in-dot" role="img" aria-label="New" />}
              <Icon name="chev" />
            </a>
            {i.row?.kind === 'dose_missed' && <MissedDoseActions personId={i.row.personId} refText={i.row.ref} />}
          </div>
        ))}
      </nav>
    </section>
  )
  return (
    <div className="sh sh-me">
      <SubHeader title="Alerts" backHref="#today" backLabel="Back to Today" trailing={inbox.unread > 0 ? <button type="button" className="in-read" onClick={inbox.markAllRead}>Mark all read</button> : undefined} />
      <div className="sh-card in-info" role="note"><Icon name="bell" /><div><b>Family alerts show here when you open Bantay</b><p className="sh-sub" style={{ margin: '4px 0 0' }}>Missed doses, storms and SOS from your family appear in this list. The browser app also gets notifications.</p></div></div>
      {inbox.items.length === 0 ? (
        <div className="sh-card"><b>No alerts yet</b><p className="sh-sub" style={{ margin: '4px 0 0' }}>Warnings, medicine reminders and family alerts show here.</p></div>
      ) : (
        <>{group('Today', today)}{group('Earlier', earlier)}</>
      )}
      <p className="sh-sub" style={{ margin: 0 }}>Alerts never show readings or results. Open Bantay to see more.</p>
    </div>
  )
}
