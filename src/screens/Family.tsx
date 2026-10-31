import { useEffect, useState } from 'react'
import { AcceptCard } from '../features/sharing/AcceptCard'
import Calendar from '../features/family/Calendar'
import FacesRow from '../features/family/FacesRow'
import FamilyMessages from '../features/family/FamilyMessages'
import { IncomingSos } from '../features/family/IncomingSos'
import MemberPage from '../features/family/MemberPage'
import Memories from '../features/family/Memories'
import { dayKey } from '../features/family/events'
import { listMessages, type Msg } from '../features/family/messagesApi'
import { stamp } from '../features/family/messagesLogic'
import NeedYouNow from '../features/family/NeedYouNow'
import Papers from '../features/family/Papers'
import Plan from '../features/family/Plan'
import { dayRows, groupPlan, progressOf } from '../features/family/planList'
import ProfileCard from '../features/family/ProfileCard'
import Report from '../features/family/Report'
import { useFamilyPeople, type FamilyPerson } from '../features/family/roster'
import { StormRollCall } from '../features/family/StormRollCall'
import { usePlan } from '../features/family/usePlan'
import { Row } from '../features/look/Row'
import { Icon } from '../features/shell/Icon'
import { SubHeader } from '../features/shell/SubHeader'
import { useKv } from '../features/shell/useKv'
import { useActing } from '../features/viewas/viewAs'
import '../features/family/family.css'

export type FamilySeg = 'home' | 'messages' | 'plan' | 'papers'

/** Which part of Family the hash names. #family and #family/people are Home, #family/messages the one shared chat, #family/plan and #plan the Plan, #family/papers the Papers screen
 *  (#records and #health/papers redirect there, routes.ts); #family/people/<id> is one member's page. The hash is the source of truth so deep links and Back work. */
export function parseFamily(h: string): { seg: FamilySeg; member: string | null } {
  const [head, a, b] = h.replace(/^#/, '').split('/')
  if (head === 'family' && a === 'people' && b) return { seg: 'home', member: decodeURIComponent(b) }
  const k = head === 'family' ? a : head
  return { seg: k === 'plan' ? 'plan' : head === 'family' && k === 'messages' ? 'messages' : head === 'family' && k === 'papers' ? 'papers' : 'home', member: null }
}

/** #family/people/<id>/report is that member's health report. */
export const isReport = (h: string) => /^#?family\/people\/[^/]+\/report$/.test(h)

const SEEN = 'family.msgs.seen' // kv: ISO time the family chat was last opened on this phone
const textOf = (m: Msg) => m.kind === 'voice' ? 'Voice note' : m.kind === 'photo' ? 'Photo' : m.kind === 'file' ? (m.name ?? 'File') : m.kind === 'kudos' ? 'Sent a heart' : (m.body ?? '')

/** The Messages row's words: the newest message with its sender, and how many arrived from others since the chat was last opened (one count, the rows it summarises, ML-34).
 *  Nothing yet = "Say hello". */
export function messagesPreview(msgs: Msg[], people: FamilyPerson[], seen: string | null): { sub: string; unread: number } {
  const last = msgs[msgs.length - 1]
  if (!last) return { sub: 'Say hello', unread: 0 }
  const who = last.mine ? 'You' : (people.find((p) => p.id === last.senderPersonId)?.name.trim().split(/\s+/)[0] ?? 'Family')
  const t = stamp(last.createdAt)
  const seenAt = seen ? Date.parse(seen) : NaN // parsed, not string-compared: the server writes '+00:00', the phone 'Z'
  const unread = msgs.filter((m) => !m.mine && !(Date.parse(m.createdAt) <= seenAt)).length
  return { sub: `Family chat · ${who}: ${textOf(last)}${t ? ` · ${t}` : ''}`, unread }
}

function MessagesRow() {
  const { people } = useFamilyPeople()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [seen, , seenLoaded] = useKv<string | null>(SEEN, null)
  useEffect(() => {
    let live = true
    void listMessages(20).then((r) => { if (live && r.ok) setMsgs(r.data) })
    return () => { live = false }
  }, [])
  const p = messagesPreview(msgs, people, seenLoaded ? seen : new Date().toISOString())
  return <div className="card fm2-row"><Row icon="msg" title="Messages" sub={p.sub} href="#family/messages" badge={p.unread} testId="msgs" /></div>
}

function PlanRow() {
  const { tasks, events, notes } = usePlan()
  const now = new Date()
  const rows = dayRows(groupPlan(tasks, events, notes, now), dayKey(now), now)
  const prog = progressOf(rows)
  const sub = prog.total > 0 ? `${prog.done} of ${prog.total} done today` : rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'thing' : 'things'} today` : 'Nothing planned'
  return <div className="card fm2-row"><Row icon="calendar" title="Plan" sub={sub} href="#family/plan" testId="planrow" /></div>
}

/** Memories as a 64 px row; tap to open the photos in place (as now: off until turned on, family uploads only). One button, so one expanded state (the Row's own button cannot carry aria-expanded). */
function MemoriesRow() {
  const [open, setOpen] = useState(false)
  return (
    <div className="card fm2-row fm2-mem" data-testid="memoriesrow">
      <div className="rw">
        <button type="button" className="rw-main press" aria-expanded={open} aria-controls="fm2-mem-body" onClick={() => setOpen((o) => !o)}>
          <span className="rw-lead"><Icon name="smile" size={20} /></span>
          <span className="rw-txt"><b className="rw-title">Memories</b><span className="rw-sub">{open ? 'Family photos' : 'Family photos, kept private'}</span></span>
          <Icon name={open ? 'up' : 'plus'} size={20} />
        </button>
      </div>
      {open && <div id="fm2-mem-body"><Memories /></div>}
    </div>
  )
}

export default function Family() {
  const { seg, member } = parseFamily(location.hash)
  const { acting } = useActing()
  const [, setSeen] = useKv<string | null>(SEEN, null)
  useEffect(() => {
    if (seg !== 'messages' || member) return
    // Seen = the newest message's own (server) time, so a phone clock that is off cannot hide or invent unread. Leaving marks what arrived while the chat was open.
    const mark = () => void listMessages(1).then((r) => { if (r.ok) setSeen(r.data[r.data.length - 1]?.createdAt ?? new Date().toISOString()) })
    mark()
    return mark
  }, [seg, member]) // eslint-disable-line react-hooks/exhaustive-deps
  if (member) return isReport(location.hash) ? <Report id={member} /> : <MemberPage id={member} />
  if (seg === 'papers') return <Papers />
  if (seg === 'messages') return (<><SubHeader title="Messages" backHref="#family" backLabel="Back to Family" /><FamilyMessages /></>)
  if (seg === 'plan') return (<><SubHeader title="Plan" backHref="#family" backLabel="Back to Family" /><Plan /></>)
  return (
    <>
      <div className="hdr"><h1>Family</h1></div>
      <AcceptCard />
      <IncomingSos placement="family" />
      <StormRollCall /> {/* shows itself only while a PAGASA wind signal is live */}
      <ProfileCard />
      {!acting && <NeedYouNow />}
      <FacesRow />
      <MessagesRow />
      <PlanRow />
      <Calendar />
      <MemoriesRow />
    </>
  )
}
