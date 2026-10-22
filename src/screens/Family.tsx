import MemberPage from '../features/family/MemberPage'
import People from '../features/family/People'
import Plan from '../features/family/Plan'
import Report from '../features/family/Report'
import type { FamilySeg } from '../features/shell/routes'

/** Which part of Family the hash names. #family and #family/people are People, #family/plan and #plan are Plan (Records moved to Health > Papers, #records still redirects there),
 *  #family/people/<id> is one member's page. The hash is the source of truth so deep links and Back work. */
export function parseFamily(h: string): { seg: FamilySeg; member: string | null } {
  const [head, a, b] = h.replace(/^#/, '').split('/')
  if (head === 'family' && a === 'people' && b) return { seg: 'people', member: decodeURIComponent(b) }
  const k = head === 'family' ? a : head
  return { seg: k === 'plan' ? 'plan' : 'people', member: null }
}

/** #family/people/<id>/report is that member's health report. */
export const isReport = (h: string) => /^#?family\/people\/[^/]+\/report$/.test(h)

const HASH: Record<FamilySeg, string> = { plan: 'family/plan', people: 'family' }

export default function Family() {
  const { seg, member } = parseFamily(location.hash)
  const pick = (s: FamilySeg) => { if (location.hash !== '#' + HASH[s]) location.hash = HASH[s] }
  if (member) return isReport(location.hash) ? <Report id={member} /> : <MemberPage id={member} />
  return (
    <>
      <div className="hdr">
        <h1>Family</h1>
      </div>
      <div className="seg" role="group" aria-label="Family view" >
        <button aria-pressed={seg === 'people'} onClick={() => pick('people')}>People</button>
        <button aria-pressed={seg === 'plan'} onClick={() => pick('plan')}>Plan</button>
      </div>
      {seg === 'plan' ? <Plan /> : <People />}
    </>
  )
}
