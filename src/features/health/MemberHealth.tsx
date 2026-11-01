import { useEffect } from 'react'
import { Row, LargeTitle, Section, Skeleton } from '../look'
import { useActingPersonId } from '../viewas/viewAs'
import { clock12 } from './medActions'
import { givenName, shortMedName } from './medName'
import { labsLine } from './GlanceGrid'
import { toCheck } from './MedReview'
import { useToday } from './Medicines'
import { useHealthPerson } from './useHealthPerson'

/** #health/member/<id>: someone else's health. The page itself has no Take, Skip or Add; the rows open screens where a carer with logging shared can log, so the bar says view only only when they cannot. */
export function MemberHealth({ id }: { id: string }) {
  const { ready, people, ownId, acting, personId, setPersonId, readings, thresholds, canMark, lockReason } = useHealthPerson()
  const actingId = useActingPersonId()
  const meId = (acting ? actingId : ownId) ?? ''
  const person = people.find((p) => p.id === id)
  useEffect(() => { if (person) setPersonId(id) }, [person, id, setPersonId])
  const name = person ? givenName(person.name) : ''
  const back = <a className="btn" href="#health" onClick={() => meId && setPersonId(meId)}>Back to me</a>
  if (!ready) return <><LargeTitle kicker="Summary" title="Health" /><Skeleton lines={3} /></>
  if (!person) return <><LargeTitle kicker="Summary" title="Health" /><p className="mh-none">You cannot see this person</p>{back}</>
  const here = personId === id // the data below is the member's only once the choice has moved
  return (
    <>
      <LargeTitle kicker="Summary" title="Health" />
      <div className="mh-bar" data-testid="member-bar"><span className="grow">Viewing {name} · {canMark ? 'you can log for them' : 'view only'}</span>{back}</div>
      {here && <MemberBody personId={id} name={name} readings={readings} thresholds={thresholds} />}
      {here && !canMark && <p className="sub mh-foot" data-testid="member-footer">{lockReason ?? `${name} has not shared logging with you, so you can look but not add. Ask them in Family to share.`}</p>}
    </>
  )
}

function MemberBody({ personId, name, readings, thresholds }: { personId: string; name: string; readings: ReturnType<typeof useHealthPerson>['readings']; thresholds: ReturnType<typeof useHealthPerson>['thresholds'] }) {
  const { meds, doses } = useToday(personId)
  const taken = doses.filter((d) => d.state === 'taken').length
  const check = meds ? toCheck(meds).length : 0
  return (
    <>
      <Section title={`${name} today`} meta={doses.length ? `${taken} of ${doses.length} taken` : undefined}>
        {doses.length === 0
          ? <p className="sub">{meds === undefined ? 'Loading' : 'Nothing due today'}</p>
          : <div className="grp" data-testid="member-doses">{doses.map((d) => (
            <div className="row" key={`${d.key}:${d.slot}`}>
              <span className="grow"><strong>{shortMedName(d.name)}</strong><span className="sub" style={{ display: 'block' }}>{clock12(d.slot)}</span></span>
              <span>{d.state === 'taken' ? 'Taken' : d.state === 'skipped' ? 'Skipped' : 'Not yet'}</span>
            </div>
          ))}</div>}
      </Section>
      <Section title="Summary">
        <div className="mh-list">
          <Row icon="gauge" title="Readings" sub={readings.length ? `${readings.length} on record` : 'None yet'} href="#health/readings" />
          <Row icon="flask" title="Labs" sub={labsLine(readings, thresholds)} href="#health/labs" />
          <Row icon="msg" title="Questions waiting" sub={check ? `${check} to check` : 'Nothing to check'} href="#health/meds" />
        </div>
      </Section>
    </>
  )
}
