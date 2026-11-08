import { useEffect, useMemo } from 'react'
import { ActivityCard } from '../features/family/ActivityCard'
import FamilyFeed from '../features/family/FamilyFeed'
import CalendarPage from '../features/family/CalendarPage'
import FamilyMessages from '../features/family/FamilyMessages'
import { familyFeedOn, familyPlacesOn } from '../features/family/flags'
import { IncomingSos } from '../features/family/IncomingSos'
import MemberPage from '../features/family/MemberPage'
import Memories from '../features/family/Memories'
import { listMessages } from '../features/family/messagesApi'
import { NeedsList } from '../features/family/NeedsList'
import Papers from '../features/family/Papers'
import { PeopleList } from '../features/family/PeopleList'
import PlaceNotice from '../features/family/PlaceNotice'
import { PlaceScreen, WhereCard } from '../features/family/PlaceSection'
import { usePlaces } from '../features/family/placeApi'
import PlanPage from '../features/family/PlanPage'
import Report from '../features/family/Report'
import { useCarerIds } from '../features/family/CarerCards'
import { StormRollCall } from '../features/family/StormRollCall'
import { PapersSection, SEEN, TogetherList } from '../features/family/TogetherList'
import { TodayCarousel } from '../features/family/TodayCarousel'
import '../features/family/s25-family.css'
import { useFamilyScope, useLinkedPeople } from '../features/family/useFamilyScope'
import { useFocuses } from '../features/family/useFocuses'
import { PersonSwitcher, type SwitcherGroup } from '../features/health/PersonSwitcher'
import { LargeTitle } from '../features/look'
import { HeadActions } from '../features/shell/HeadActions'
import { Icon } from '../features/shell/Icon'
import { SubHeader } from '../features/shell/SubHeader'
import { useKv } from '../features/shell/useKv'
import { useActing } from '../features/viewas/viewAs'
import '../features/family/family.css'

export { messagesPreview } from '../features/family/messagesPreview'

export type FamilySeg = 'home' | 'messages' | 'plan' | 'calendar' | 'papers' | 'memories' | 'feed' | 'map'

/** Which part of Family the hash names. #family and #family/people are Home, #family/messages the one shared chat, #family/plan and #plan the Plan, #family/papers the Papers screen
 *  (#records and #health/papers redirect there, routes.ts); #family/people/<id> is one member's page. The hash is the source of truth so deep links and Back work. */
export function parseFamily(h: string): { seg: FamilySeg; member: string | null } {
  const [head, a, b] = h.replace(/^#/, '').split('/')
  if (head === 'family' && a === 'people' && b) return { seg: 'home', member: decodeURIComponent(b) }
  const k = head === 'family' ? a : head
  return { seg: k === 'plan' ? 'plan' : head === 'family' && k === 'calendar' ? 'calendar' : head === 'family' && k === 'messages' ? 'messages' : head === 'family' && k === 'papers' ? 'papers' : head === 'family' && k === 'memories' ? 'memories' : head === 'family' && k === 'feed' ? 'feed' : head === 'family' && k === 'map' ? 'map' : 'home', member: null }
}

/** #family/people/<id>/report is that member's health report. */
export const isReport = (h: string) => /^#?family\/people\/[^/]+\/report$/.test(h)

/** The sheet's blocks (board "Who to show"): Me, then who you care for (writer links), then everyone else. The owner's rest are theirs alone, so the label says so; for anyone else the rest are people a read-only link shows them. */
function groupsOf(options: { id: string; isMe: boolean }[], writable: string[], isOwner: boolean): SwitcherGroup[] {
  const care = options.filter((p) => !p.isMe && writable.includes(p.id))
  const rest = options.filter((p) => !p.isMe && !writable.includes(p.id))
  const out: SwitcherGroup[] = [{ rows: options.filter((p) => p.isMe).map((p) => ({ id: p.id })) }]
  if (care.length) out.push({ label: 'You care for', rows: care.map((p) => ({ id: p.id, sub: 'You are their carer' })) })
  if (rest.length) out.push({ label: isOwner ? 'Everyone else (only your account sees these)' : 'Everyone else', rows: rest.map((p) => ({ id: p.id, sub: 'View only' })) })
  return out
}

/** The Family root (v13, D-109): large title with the "Who to show" pill and Add, then (S25 board) Together, Papers, Where everyone is, Needs you now, People, and last the shown person's Today and Activity. It opens on Me and shows one person at a time; only a writer carer's "missed a medicine" reaches the page for anyone else. Everything is read from this phone; nothing is invented. */
function Root() {
  const { shown, options, select, isOwner } = useFamilyScope()
  const writable = useCarerIds()
  const { acting } = useActing()
  const linked = useLinkedPeople()
  const watch = useMemo(() => options.filter((p) => p.id === shown.id || (!acting && writable.includes(p.id))), [options, shown.id, acting, writable]) // the person on show, plus the people you care for so their missed doses stay in Needs you now
  const fx = useFocuses(watch)
  const onShow = useMemo(() => ({ ...fx, items: fx.items.filter((i) => i.person.id === shown.id) }), [fx, shown.id])
  const needs = useMemo(() => ({ ...fx, items: fx.items.filter((i) => i.person.isMe || writable.includes(i.person.id)) }), [fx, writable]) // a view-only person on show must not raise "missed a medicine"
  const pick = (id: string) => { select(id); const today = document.querySelector('[data-testid="facesrow"]'); if (today?.scrollIntoView) today.scrollIntoView({ block: 'start' }); else document.querySelector('.bt .scroll')?.scrollTo?.({ top: 0 }) } // S25: Today (the shown person) now sits under People, so show it
  const me = options.find((p) => p.isMe)
  const groups = useMemo(() => groupsOf(options, writable, isOwner), [options, writable, isOwner])
  const places = usePlaces() // null with the places flag off, offline, or before 0052 is applied
  const pill = <PersonSwitcher people={options} meId={me?.id ?? ''} personId={shown.id} setPersonId={() => undefined} onPick={pick} title="Who to show" groups={acting ? undefined : groups} foot={acting ? undefined : 'Family opens on Me every time.'} />
  return (
    <>
      <LargeTitle kicker=" " title="Family" actions={<HeadActions>{pill}<a className="btn-round" href="#me/family" aria-label="Add a family member"><Icon name="plus" size={20} /></a></HeadActions>} />
      <IncomingSos placement="family" />
      <StormRollCall /> {/* shows itself only while a PAGASA wind signal is live */}
      <TogetherList />
      <PapersSection />
      <PlaceNotice />
      <WhereCard places={places} />
      <NeedsList fx={needs} people={options} selfName={me?.name ?? ''} shownId={shown.id} onSelect={pick} />
      <PeopleList people={linked} places={places} />
      <TodayCarousel people={shown.id ? [shown] : []} fx={onShow} />
      <ActivityCard people={shown.id ? [shown] : []} />
    </>
  )
}

export default function Family() {
  const { seg, member } = parseFamily(location.hash)
  const [, setSeen] = useKv<string | null>(SEEN, null)
  useActing() // re-render when View-as starts or stops
  useEffect(() => {
    if (seg !== 'messages' || member) return
    // Seen = the newest message's own (server) time, so a phone clock that is off cannot hide or invent unread. Leaving marks what arrived while the chat was open.
    const mark = () => void listMessages(1).then((r) => { if (r.ok) setSeen(r.data[r.data.length - 1]?.createdAt ?? new Date().toISOString()) })
    mark()
    return mark
  }, [seg, member]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if ((seg === 'feed' && !familyFeedOn()) || (seg === 'map' && !familyPlacesOn())) location.replace('#family') }, [seg])
  if (member) return isReport(location.hash) ? <Report id={member} /> : <MemberPage id={member} />
  if (seg === 'papers') return <Papers />
  if (seg === 'feed') return familyFeedOn() ? <FamilyFeed /> : null
  if (seg === 'map') return familyPlacesOn() ? (<><SubHeader title="Where everyone is" backHref="#family" backLabel="Back to Family" /><PlaceScreen /></>) : null
  if (seg === 'memories') return (<><LargeTitle back={{ href: '#family', label: 'Family' }} title="Memories" /><Memories /></>)
  if (seg === 'messages') return (<><SubHeader title="Messages" backHref="#family" backLabel="Back to Family" /><FamilyMessages /></>)
  if (seg === 'plan') return <PlanPage />
  if (seg === 'calendar') return <CalendarPage />
  return <Root />
}
