import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { Section } from '../look'
import { KIND } from '../records/ConfirmSheet'
import { useConfirmedDocs, useQueue } from '../records/useRecordsServer'
import { useKv } from '../shell/useKv'
import { dayKey, eventDay } from './events'
import { familyFeedOn } from './flags'
import { listMessages, type Msg } from './messagesApi'
import { messagesPreview } from './messagesPreview'
import { PaperActions } from './Papers'
import { dayLabel, dayRows, groupPlan, progressOf } from './planList'
import { useFamilyPeople } from './roster'
import { usePlan } from './usePlan'
import type { FamilyEvent } from './store'
import type { DocBundle } from '../records/api'
import './family.css'
import './v13-family.css'

export const SEEN = 'family.msgs.seen' // kv: ISO time the family chat was last opened on this phone

const planSub = (rows: ReturnType<typeof dayRows>) => {
  const prog = progressOf(rows)
  return prog.total > 0 ? `${prog.done} of ${prog.total} done today` : rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'thing' : 'things'} today` : 'Nothing planned'
}

/** The Calendar tile's line: the first event from today on, by the phone's local day (an all-day event starts the evening before in UTC, so never slice the ISO string). */
export function calSummary(events: FamilyEvent[], now: Date): string {
  const today = dayKey(now)
  const next = events.filter((e) => eventDay(e) >= today).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
  return next ? `${next.title} · ${dayLabel(eventDay(next), now)}` : 'Nothing coming up'
}

/** The 3 newest of the viewer's own confirmed papers: paper date first, else the day it was confirmed. */
export function recentPapers(docs: DocBundle[]): DocBundle[] {
  const key = (b: DocBundle) => b.doc.doc_date ?? b.doc.confirmed_at ?? ''
  return [...docs].sort((a, b) => key(b).localeCompare(key(a))).slice(0, 3)
}

const paperDate = (iso: string | null) => {
  if (!iso) return 'Saved'
  const day = iso.length === 10 ? iso : dayKey(new Date(iso)) // a plain paper date stays as written; a confirmed-at instant becomes the phone's day
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Saved'
}

function Tile(p: { href: string; icon: IconName; tint: 'amber' | 'blue' | 'green' | 'purple'; title: string; sub: string; testId: string; badge?: number }) {
  return (
    <a className="fm-tile" href={p.href} data-tint={p.tint} data-testid={p.testId}>
      <Icon name={p.icon} size={28} />
      <span><b>{p.title}{p.badge ? <span className="fm-tile-n"> · {p.badge} new</span> : null}</b><span className="fm-tile-s">{p.sub}</span></span>
    </a>
  )
}

/** Papers first (highlighted card: Upload, Scan, the 3 newest confirmed papers, All papers), then Plan, Calendar, Messages, Memories as a 2x2 grid (board S24Family, D-152). */
export function TogetherList() {
  const { people, selfId } = useFamilyPeople()
  const { tasks, events, notes } = usePlan()
  const queue = useQueue()
  const docs = useConfirmedDocs(selfId ?? '')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [seen, , seenLoaded] = useKv<string | null>(SEEN, null)
  useEffect(() => {
    let live = true
    void listMessages(20).then((r) => { if (live && r.ok) setMsgs(r.data) })
    return () => { live = false }
  }, [])
  const now = new Date()
  const todayRows = dayRows(groupPlan(tasks, events, notes, now), dayKey(now), now)
  const prog = progressOf(todayRows)
  const planOpen = prog.total > 0 ? prog.total - prog.done : todayRows.length
  const m = messagesPreview(msgs, people, seenLoaded ? seen : new Date().toISOString())
  const calSub = calSummary(events, now)
  const recent = recentPapers(docs)
  const toReview = selfId ? queue.byPerson[selfId] ?? 0 : 0 // the viewer's own queue, the same scope as the rows below
  return (
    <>
      <Section title="Papers" link={familyFeedOn() ? { href: '#family/feed', label: 'Updates' } : undefined} testId="papers-section">
        <div className="fm-papers" data-testid="papers-card">
          <div className="fm-papers-top">
            <div><b className="fm-papers-h">Labs, photos and documents</b><span className="fm-tile-s">Your papers in one place, ready for the next visit</span></div>
            {toReview > 0 && <span className="fm-pill" data-testid="papers-review">{toReview} to review</span>}
          </div>
          <PaperActions />
          {recent.map((b) => (
            <a key={b.doc.id} className="fm-doc" href="#family/papers" data-testid="paper-row">
              <Icon name="file" size={20} />
              <span className="fm-doc-t"><b>{KIND[b.doc.kind] ?? 'Document'}</b><span className="fm-tile-s">{paperDate(b.doc.doc_date ?? b.doc.confirmed_at)}</span></span>
              <span className="fm-pill fm-pill-done">Done</span>
            </a>
          ))}
          <a className="fm-all" href="#family/papers" data-testid="papersrow">All papers{docs.length > 0 ? ` (${docs.length})` : ''} ›</a>
        </div>
      </Section>
      <Section title="Together" testId="together">
        <div className="fm-tiles" data-testid="together-list">
          <Tile testId="planrow" href="#family/plan" icon="calendar" tint="amber" title="Plan" sub={planOpen > 0 ? `${planOpen} open · ${planSub(todayRows)}` : planSub(todayRows)} />
          <Tile testId="calrow" href="#family/calendar" icon="calendar" tint="blue" title="Calendar" sub={calSub} />
          <Tile testId="msgs" href="#family/messages" icon="msg" tint="green" title="Messages" sub={m.sub} badge={m.unread} />
          <Tile testId="memoriesrow" href="#family/memories" icon="photo" tint="purple" title="Memories" sub="Family photos, kept private" />
        </div>
      </Section>
    </>
  )
}
