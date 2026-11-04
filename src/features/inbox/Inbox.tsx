import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { db } from '../../db'
import { ASK_EVENT } from '../assistant/Assistant'
import { EmptyState } from '../look/EmptyState'
import { GroupedList } from '../look/GroupedList'
import { Row, type Tint } from '../look/Row'
import { Sheet, leaveSheet } from '../look/Sheet'
import { Icon, type IconName } from '../shell/Icon'
import { LargeTitle } from '../look/LargeTitle'
import { useKv } from '../shell/useKv'
import { groupInbox, iconOf, type InboxIcon, type InboxItem } from './build'
import { MissedDoseActions } from './MissedDoseActions'
import type { Inbox as InboxState } from './useInbox'
import './inbox.css'

const ICON: Record<InboxIcon, IconName> = { alert: 'warn', dose: 'pill', weather: 'cloud', family: 'shield', record: 'shield', update: 'shield' }
const TINT: Record<InboxIcon, Tint> = { alert: 'red', dose: 'blue', weather: 'teal', family: 'purple', record: 'green', update: 'none' }
const INTRO_KEY = 'notif.intro'
const manilaDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(ms)
/** The row's time: the clock for something from today (Manila), the date for an earlier day. */
const clock = (i: InboxItem, now: Date) => i.at == null ? undefined : new Intl.DateTimeFormat('en-PH', manilaDay(i.at) === manilaDay(now.getTime()) ? { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' } : { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(i.at)

/** Alerts (v13 board): one Row per alert (title, sub, time); the actions sit behind a tap in the alert's sheet. Unread are grouped under "New (n)" with Mark all read in that title row. */
export function Inbox({ inbox, now }: { inbox: Omit<InboxState, 'openRow' | 'markOne'> & { openRow?: InboxState['openRow']; markOne?: InboxState['markOne'] }; now?: Date }) {
  const [open, setOpen] = useState<InboxItem | null>(null)
  const [introSeen, , introLoaded] = useKv<boolean>(INTRO_KEY, false)
  const shown = useRef(false)
  shown.current = inbox.items.length > 0
  useEffect(() => () => { if (shown.current) void db.kv.put({ key: INTRO_KEY, value: true }).catch(() => undefined) }, []) // the full card shows on the first visit; leaving the screen with a list on it is the visit
  const seen = new Set(inbox.seen)
  const isNew = (i: InboxItem) => (i.seen === undefined ? !seen.has(i.id) : !i.seen)
  const fresh = inbox.items.filter(isNew)
  const { today, earlier } = groupInbox(inbox.items.filter((i) => !isNew(i)), now ?? new Date())
  const when = now ?? new Date()
  const group = (label: string, list: InboxItem[], head?: boolean) => list.length === 0 ? null : (
    <section key={label} aria-label={label} data-testid={`inbox-${label.split(' ')[0]!.toLowerCase()}`}>
      <div className="in-hrow"><h2 className="in-h">{label}</h2>{head && <button type="button" className="in-read" onClick={inbox.markAllRead}>Mark all read</button>}</div>
      <GroupedList icons label={`${label} notifications`}>
        {list.map((i) => { const v = clock(i, when); return <Row key={i.id} icon={ICON[iconOf(i)]} tint={i.tone === 'urgent' && i.kind === 'family' ? 'red' : TINT[iconOf(i)]} title={i.title} sub={v && i.sub.endsWith(` · ${v}`) ? i.sub.slice(0, -(v.length + 3)) : i.sub} value={v} chev onClick={() => setOpen(i)} testId="inbox-row" /> })}
      </GroupedList>
    </section>
  )
  return (
    <div className="sh sh-me">
      <LargeTitle title="Alerts" back={{ href: '#today', label: 'Today' }} />
      {inbox.items.length === 0 ? (
        <EmptyState icon="bell" title="No alerts yet" body="Family alerts show up here." />
      ) : (
        <>
          {!introLoaded || introSeen
            ? <p className="in-info1" role="note"><b>Family alerts show here when you open Bantay</b></p>
            : <div className="sh-card in-info" role="note"><Icon name="bell" /><div><b>Family alerts show here when you open Bantay</b><p className="sh-sub" style={{ margin: '4px 0 0' }}>Missed doses, storms and SOS from your family appear in this list. The browser app also gets notifications.</p></div></div>}
          {group(`New (${fresh.length})`, fresh, inbox.unread > 0)}{group('Today', today)}{group('Earlier', earlier)}
        </>
      )}
      <p className="sh-sub" style={{ margin: 0 }}>Alerts never show readings or results. Open Bantay to see more.</p>
      {open && <AlertSheet item={open} fresh={isNew(open)} inbox={inbox} onClose={() => setOpen(null)} />}
    </div>
  )
}

function AlertSheet({ item, fresh, inbox, onClose }: { item: InboxItem; fresh: boolean; inbox: Pick<InboxState, 'markAllRead'> & { openRow?: InboxState['openRow']; markOne?: InboxState['markOne'] }; onClose: () => void }) {
  const go = () => { if (item.row) inbox.openRow?.(item.row.id); leaveSheet(() => { location.hash = item.href }); onClose() }
  const ask = () => { leaveSheet(() => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text: `Tell me about this alert: ${item.title}` } }))); onClose() }
  const missed = item.row?.kind === 'dose_missed'
  useEffect(() => { if (missed && item.row) inbox.openRow?.(item.row.id) }, []) // looking at a missed dose marks it seen, as a tap on the row did before
  const hashLink = (e: MouseEvent<HTMLElement>) => { // a hash link inside the sheet pops the sheet's history entry first, so Back is one press
    const h = (e.target as HTMLElement).closest('a')?.getAttribute('href')
    if (h?.startsWith('#')) { e.preventDefault(); leaveSheet(() => { location.hash = h }); onClose() }
  }
  return (
    <Sheet title={item.title} onClose={onClose} testId="alert-sheet">
      <p className="sh-sub in-sheet-sub">{item.sub}</p>
      {missed
        ? <div onClick={hashLink}><MissedDoseActions personId={item.row!.personId} refText={item.row!.ref} /></div>
        : (
          <div className="in-actions in-sheet-actions" role="group" aria-label="What you can do">
            <a className="btn in-act" href={item.href} onClick={(e) => { e.preventDefault(); go() }}>Open</a>
            <button type="button" className="btn2 in-act" onClick={ask}>Ask Jack about this</button>
            {fresh && inbox.markOne && <button type="button" className="btn2 in-act" onClick={() => { inbox.markOne?.(item); leaveSheet(() => undefined); onClose() }}>Mark read</button>}
          </div>
        )}
    </Sheet>
  )
}
