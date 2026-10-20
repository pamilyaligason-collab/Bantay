import { useRef } from 'react'
import { useCheckIns, useFamilyPeople } from '../family/roster'
import { familyGlance } from './familyLine'
import { useSeenDaily } from './seen'

/** One row under My week: "Family: 2 of 3 OK today" (the others, not me) and the one thing that needs attention. Opens Family, where the full list lives. */
export default function FamilyLine() {
  const { people } = useFamilyPeople()
  const last = useCheckIns()
  const g = familyGlance(people.filter((p) => !p.isMe), last, new Date())
  const ref = useRef<HTMLAnchorElement>(null)
  useSeenDaily(ref, 'card_seen_family_line', !!g)
  if (!g) return null
  return (
    <a ref={ref} className="card td-week td-fam" href="#family" aria-label={`Family: ${g.ok} of ${g.total} OK today${g.attention ? `. ${g.attention}` : ''}. Open Family`}>
      <span className="td-grow">
        <b>Family: {g.ok} of {g.total} OK today</b>
        <span className={`td-sub${g.attention ? ' td-attn' : ''}`}>{g.attention ?? 'Nobody needs a look'}</span>
      </span>
      <span className="td-link" aria-hidden="true">Family ›</span>
    </a>
  )
}
