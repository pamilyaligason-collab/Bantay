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
import { dayLabel } from './planList'
import { useFamilyPeople } from './roster'
import type { FamilyEvent } from './store'
import type { DocBundle } from '../records/api'
import './family.css'
import './v13-family.css'
import './s28-family.css'

export const SEEN = 'family.msgs.seen' // kv: ISO time the family chat was last opened on this phone

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
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Saved'
}

function Tile(p: { href: string; icon: IconName; tint: 'amber' | 'blue' | 'green' | 'purple'; title: string; sub: string; testId: string; badge?: number }) {
  return (
    <a className="fm-tile" href={p.href} data-tint={p.tint} data-testid={p.testId}>
      <span className="fm-tile-ic"><Icon name={p.icon} size={28} /></span>
      <span><b className="cd-title">{p.title}{p.badge ? <span className="fm-tile-n"> · {p.badge} new</span> : null}</b><span className="fm-tile-s cd-meta">{p.sub}</span></span>
    </a>
  )
}

/** Papers (highlighted card: Upload, Scan, the 3 newest confirmed papers, All papers). S25 (board S25Family): it sits right under Together. */
export function PapersSection() {
  const { selfId } = useFamilyPeople()
  const queue = useQueue()
  const docs = useConfirmedDocs(selfId ?? '')
  const recent = recentPapers(docs)
  const toReview = selfId ? queue.byPerson[selfId] ?? 0 : 0 // the viewer's own queue, the same scope as the rows below
  return (
    <Section title="Papers" testId="papers-section">
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
        <a className="fm-all" href="#family/papers" data-testid="papersrow">All papers{docs.length > 0 ? ` (${docs.length})` : ''}<Icon name="chev" size={16} /></a>
      </div>
    </Section>
  )
}

/** Messages and Memories as soft-gradient cards (board S25Family, D-152). S26 (D-168): Plan folded into the Calendar card, which sits right under this. */
export function TogetherList() {
  const { people } = useFamilyPeople()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [seen, , seenLoaded] = useKv<string | null>(SEEN, null)
  useEffect(() => {
    let live = true
    void listMessages(20).then((r) => { if (live && r.ok) setMsgs(r.data) })
    return () => { live = false }
  }, [])
  const m = messagesPreview(msgs, people, seenLoaded ? seen : new Date().toISOString())
  return (
    <Section title="Together" link={familyFeedOn() ? { href: '#family/feed', label: 'Updates' } : undefined} testId="together">
        <div className="fm-tiles" data-testid="together-list">
          <Tile testId="msgs" href="#family/messages" icon="msg" tint="green" title="Messages" sub={m.sub} badge={m.unread} />
          <Tile testId="memoriesrow" href="#family/memories" icon="photo" tint="purple" title="Memories" sub="Family photos, kept private" />
        </div>
    </Section>
  )
}
