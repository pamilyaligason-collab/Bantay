import FamilyMessages from '../features/family/FamilyMessages'
import MemberPage from '../features/family/MemberPage'
import People from '../features/family/People'
import Plan from '../features/family/Plan'
import Report from '../features/family/Report'
import Records from './Records'
import { SubHeader } from '../features/shell/SubHeader'

export type FamilySeg = 'home' | 'messages' | 'plan'

/** Which part of Family the hash names. #family and #family/people are Home, #family/messages is Messages, #family/plan and #plan are Plan (Records moved to Health > Papers, #records still redirects there),
 *  #family/people/<id> is one member's page. The hash is the source of truth so deep links and Back work. */
export function parseFamily(h: string): { seg: FamilySeg; member: string | null } {
  const [head, a, b] = h.replace(/^#/, '').split('/')
  if (head === 'family' && a === 'people' && b) return { seg: 'home', member: decodeURIComponent(b) }
  const k = head === 'family' ? a : head
  return { seg: k === 'plan' ? 'plan' : head === 'family' && k === 'messages' ? 'messages' : 'home', member: null }
}

/** #family/people/<id>/report is that member's health report. */
export const isReport = (h: string) => /^#?family\/people\/[^/]+\/report$/.test(h)

const HASH: Record<FamilySeg, string> = { plan: 'family/plan', messages: 'family/messages', home: 'family' }

export default function Family() {
  const { seg, member } = parseFamily(location.hash)
  const pick = (s: FamilySeg) => { if (location.hash !== '#' + HASH[s]) location.hash = HASH[s] }
  // S16-L0: #records, #health/papers and #family/records redirect here (C-3); L4 replaces this with the new Papers screen
  if (location.hash === '#family/papers') return (<><SubHeader title="Papers" backHref="#family" backLabel="Back to Family" /><Records /></>)
  if (member) return isReport(location.hash) ? <Report id={member} /> : <MemberPage id={member} />
  return (
    <>
      <div className="hdr">
        <h1>Family</h1>
      </div>
      <div className="seg fm-seg3" role="group" aria-label="Family view" >
        <button aria-pressed={seg === 'home'} onClick={() => pick('home')}>Home</button>
        <button aria-pressed={seg === 'messages'} onClick={() => pick('messages')}>Messages</button>
        <button aria-pressed={seg === 'plan'} onClick={() => pick('plan')}>Plan</button>
      </div>
      {seg === 'plan' ? <Plan /> : seg === 'messages' ? <FamilyMessages /> : <People />}
    </>
  )
}
