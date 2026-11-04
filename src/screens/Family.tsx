import { useEffect } from 'react'
import { AcceptCard } from '../features/sharing/AcceptCard'
import { ActivityCard } from '../features/family/ActivityCard'
import FamilyFeed from '../features/family/FamilyFeed'
import Calendar from '../features/family/Calendar'
import FamilyMessages from '../features/family/FamilyMessages'
import { familyFeedOn } from '../features/family/flags'
import { IncomingSos } from '../features/family/IncomingSos'
import MemberPage from '../features/family/MemberPage'
import Memories from '../features/family/Memories'
import { listMessages } from '../features/family/messagesApi'
import { NeedsList } from '../features/family/NeedsList'
import Papers from '../features/family/Papers'
import { PeopleList } from '../features/family/PeopleList'
import Plan from '../features/family/Plan'
import Report from '../features/family/Report'
import { useFamilyPeople } from '../features/family/roster'
import { StormRollCall } from '../features/family/StormRollCall'
import { SEEN, TogetherList } from '../features/family/TogetherList'
import { TodayCarousel } from '../features/family/TodayCarousel'
import { useFocuses, useVisiblePeople } from '../features/family/useFocuses'
import { LargeTitle } from '../features/look'
import { HeadActions } from '../features/shell/HeadActions'
import { Icon } from '../features/shell/Icon'
import { SubHeader } from '../features/shell/SubHeader'
import { useKv } from '../features/shell/useKv'
import { useActing } from '../features/viewas/viewAs'
import '../features/family/family.css'

export { messagesPreview } from '../features/family/messagesPreview'

export type FamilySeg = 'home' | 'messages' | 'plan' | 'papers' | 'memories' | 'feed'

/** Which part of Family the hash names. #family and #family/people are Home, #family/messages the one shared chat, #family/plan and #plan the Plan, #family/papers the Papers screen
 *  (#records and #health/papers redirect there, routes.ts); #family/people/<id> is one member's page. The hash is the source of truth so deep links and Back work. */
export function parseFamily(h: string): { seg: FamilySeg; member: string | null } {
  const [head, a, b] = h.replace(/^#/, '').split('/')
  if (head === 'family' && a === 'people' && b) return { seg: 'home', member: decodeURIComponent(b) }
  const k = head === 'family' ? a : head
  return { seg: k === 'plan' ? 'plan' : head === 'family' && k === 'messages' ? 'messages' : head === 'family' && k === 'papers' ? 'papers' : head === 'family' && k === 'memories' ? 'memories' : head === 'family' && k === 'feed' ? 'feed' : 'home', member: null }
}

/** #family/people/<id>/report is that member's health report. */
export const isReport = (h: string) => /^#?family\/people\/[^/]+\/report$/.test(h)

/** The Family root (v13): large title with Add, Today carousel, Activity, Needs you now, People, Together. Everything is read from this phone; nothing is invented. */
function Root() {
  const { people: all } = useFamilyPeople()
  const people = useVisiblePeople()
  const fx = useFocuses(people)
  const me = all.find((p) => p.isMe)
  return (
    <>
      <LargeTitle kicker={people.length ? `${people.length} ${people.length === 1 ? 'PERSON' : 'PEOPLE'}` : ' '} title="Family" actions={<HeadActions><a className="btn-round" href="#me/family" aria-label="Add a family member"><Icon name="plus" size={20} /></a></HeadActions>} />
      <AcceptCard />
      <IncomingSos placement="family" />
      <StormRollCall /> {/* shows itself only while a PAGASA wind signal is live */}
      <TodayCarousel people={people} fx={fx} />
      <ActivityCard />
      <NeedsList fx={fx} people={people} selfName={me?.name ?? ''} />
      <PeopleList people={people} />
      <TogetherList />
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
  useEffect(() => { if (seg === 'feed' && !familyFeedOn()) location.replace('#family') }, [seg])
  if (member) return isReport(location.hash) ? <Report id={member} /> : <MemberPage id={member} />
  if (seg === 'papers') return <Papers />
  if (seg === 'feed') return familyFeedOn() ? <FamilyFeed /> : null
  if (seg === 'memories') return (<><LargeTitle back={{ href: '#family', label: 'Family' }} title="Memories" /><Memories /></>)
  if (seg === 'messages') return (<><SubHeader title="Messages" backHref="#family" backLabel="Back to Family" /><FamilyMessages /></>)
  if (seg === 'plan') return (<><SubHeader title="Plan" backHref="#family" backLabel="Back to Family" /><Calendar /><Plan /></>)
  return <Root />
}
