import { useMemo } from 'react'
import FmAvatar from '../family/FmAvatar'
import type { FamilyPerson } from '../family/roster'
import { Ring } from '../look/Ring'
import { stepDays } from './detail/activityLogic'
import { memberRings } from './memberRingsLogic'
import { useTodayDoses } from './GlanceGrid'
import { localDay } from './model'
import { properName } from './medName'
import { useActivity } from './useActivity'

/** One family member: steps today against the goal, medicines taken today and the check-in, each a ring with its number in text beside it (ML-40).
 *  Only rendered for you and the people you are a writer carer of (the D-109 set that gets flag lines), so the numbers are never read for anyone else. */
export function FamilyRings({ person, checkedIn }: { person: FamilyPerson; checkedIn: boolean | null }) {
  const acts = useActivity(person.id, 2)
  const doses = useTodayDoses(person.id)
  const r = useMemo(() => {
    const today = stepDays(acts).get(localDay(new Date().toISOString())) ?? null
    return memberRings({ canSeeDetail: true, stepsToday: today, doses: doses ? { taken: doses.doses.filter((d) => d.state === 'taken').length, total: doses.doses.length } : null, checkedIn })
  }, [acts, doses, checkedIn])
  const name = person.isMe ? 'You' : properName(person.name)
  return (
    <li className="fh-m" data-testid={`fh-m-${person.id}`}>
      <span className="fh-who"><FmAvatar name={person.name} photoPath={person.photoPath} thumb={person.thumb} size={32} /><b>{name}</b></span>
      <span className="fh-rings">
        <span className="fh-r" data-testid="fh-steps">
          {r.steps ? <Ring value={r.steps.ring} size={40} hue="amber" /> : null}
          <span className="fh-rt"><b>{r.steps ? r.steps.n.toLocaleString('en-US') : '--'}</b><small>{r.steps ? 'steps today' : 'No steps yet'}</small></span>
        </span>
        {r.meds && (
          <span className="fh-r" data-testid="fh-meds">
            <Ring value={r.meds.ring} size={40} hue="green" />
            <span className="fh-rt"><b>{r.meds.taken}/{r.meds.total}</b><small>medicines</small></span>
          </span>
        )}
        <span className="fh-r" data-testid="fh-checkin">
          {r.checkedIn ? <Ring value={1} size={40} hue="blue" /> : null}
          <span className="fh-rt"><b>{r.checkedIn == null ? '--' : r.checkedIn ? 'Done' : 'Not yet'}</b><small>check-in</small></span>
        </span>
      </span>
    </li>
  )
}
