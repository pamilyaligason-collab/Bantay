import { useEffect } from 'react'
import { Row, LargeTitle, Section, Skeleton, GroupedList } from '../look'
import { HeadActions } from '../shell/HeadActions'
import { PersonSwitcher } from './PersonSwitcher'
import { useActingPersonId, useViewAs } from '../viewas/viewAs'
import '../viewas/viewas.css'
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
  const va = useViewAs()
  const person = people.find((p) => p.id === id)
  useEffect(() => { if (person) setPersonId(id) }, [person, id, setPersonId])
  const name = person ? givenName(person.name) : ''
  // While viewing as someone, the bar's Back to me ends that; this link only leaves the page, so it says so.
  const back = <a className="btn mh-back" href="#health" onClick={() => meId && setPersonId(meId)}>{acting ? 'Back to Health' : 'Back to me'}</a>
  if (!ready) return <><LargeTitle kicker="Summary" title="Health" /><Skeleton lines={3} /></>
  if (!person) return <><LargeTitle kicker="Summary" title="Health" /><p className="mh-none">You cannot see this person</p>{back}</>
  const here = personId === id // the data below is the member's only once the choice has moved
  return (
    <>
      <LargeTitle kicker="Summary" title="Health" actions={<HeadActions><PersonSwitcher people={people} meId={meId} personId={personId} setPersonId={setPersonId} /></HeadActions>} />
      <div className="mh-bar mh-stack" data-testid="member-bar"><span className="grow">Viewing {name} · {canMark ? 'you can log for them' : 'view only'}</span><span className="mh-acts">{va.can && <button type="button" className="btn" data-testid="member-open-app" disabled={!!va.busy} onClick={() => void va.go(id)}>Open the app as {name}</button>}{back}</span></div>
      {va.err && <p role="alert" className="sub mh-foot">{va.err}</p>}
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
        <GroupedList label="Summary">
          <Row icon="gauge" tint="blue" title="Readings" sub={readings.length ? `${readings.length} on record` : 'None yet'} value={readings.length ? String(readings.length) : undefined} href="#health/readings" />
          <Row icon="flask" tint="red" title="Labs" sub={labsLine(readings, thresholds)} href="#health/labs" />
          <Row icon="msg" tint="purple" title="Questions waiting" sub={check ? `${check} to check` : 'Nothing to check'} value={check ? String(check) : undefined} href="#health/meds" />
          <Row icon="meal" title="Food and salt" sub="Meals, salt and nutrients" href="#health/nutrition" />
          <Row icon="flame" title="Progress" sub="Pillbox and past days" href="#health/nudge" />
        </GroupedList>
      </Section>
    </>
  )
}
