import { useRef } from 'react'
import { useCheckIns } from '../family/roster'
import { familyGlance } from './familyLineLogic'
import { useOthers } from './useOthers'
import { useSeenDaily } from './seen'

/** One row under My week: "Family: 2 of 3 others OK today" (the others, not me) and the one thing that needs attention. Opens Family, where the full list lives. */
export default function FamilyLine() {
  const { others, now } = useOthers()
  const last = useCheckIns()
  const g = familyGlance(others, last, now)
  const ref = useRef<HTMLAnchorElement>(null)
  useSeenDaily(ref, 'card_seen_family_line', !!g)
  if (!g) return null
  return (
    <a ref={ref} className="card td-week td-fam" href="#family" aria-label={`Family: ${g.ok} of ${g.total} others OK today. ${g.note}. Open Family`}>
      <span className="td-grow">
        <b>Family: {g.ok} of {g.total} others OK today</b>
        <span className={`td-sub${g.attention ? ' td-attn' : ''}`}>{g.note}</span>
      </span>
      <span className="td-link" aria-hidden="true">Family ›</span>
    </a>
  )
}
