import FmAvatar from './FmAvatar'
import { ageOf, checkInLabel, dial, lastCheckIn, useCheckIns, useFamilyPeople } from './roster'
import './family.css'
import { Icon } from '../shell/Icon'

const back = () => { location.hash = 'family' }

/** A family member's page (mockup v6 "member"): photo, who and how old, call and text, last check-in, their Medical ID. */
export default function MemberPage({ id }: { id: string }) {
  const { people } = useFamilyPeople()
  const last = useCheckIns()
  const p = people.find((x) => x.id === id)
  if (!p) {
    return (
      <>
        <button type="button" className="fm-back" onClick={back}><Icon name="back" size={20} />Back to People</button>
        <div className="card"><p className="sub fm-empty">We could not find this person on this phone yet.</p></div>
      </>
    )
  }
  const c = checkInLabel(last[p.id])
  const age = ageOf(p.birthdate)
  const num = dial(p.phone)
  const when = lastCheckIn(last[p.id])
  const first = p.name.trim().split(/\s+/)[0] ?? p.name

  return (
    <>
      <button type="button" className="fm-back" onClick={back}><Icon name="back" size={20} />Back to People</button>
      <div className="hdr"><h1>{p.name}</h1></div>
      <div className="card fm-who">
        <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={64} status={c.ok ? 'ok' : 'none'} />
        <div className="grow">
          <b>{c.text}</b>
          <span className="sub">{[age != null ? `${age} years old` : null, p.phone].filter(Boolean).join(' · ') || 'No age or phone saved yet'}</span>
        </div>
      </div>
      {num ? (
        <div className="fm-actions">
          <a className="pill ghost" href={`tel:${num}`}>Call {first}</a>
          <a className="pill ghost" href={`sms:${num}`}>Text {first}</a>
        </div>
      ) : (
        <p className="sub fm-empty">No phone number saved for {first}. They can add it in Me.</p>
      )}
      <div className="card list">
        <div><div className="grow"><b>Last check-in</b><span className="sub">{when ?? 'Never checked in on this phone'}</span></div></div>
        <a className="fm-link" href={`#medid/${p.id}`}><span className="grow"><b>{first}'s Medical ID</b><span className="sub">Allergies, conditions, who to call</span></span><span className="fm-chev"><Icon name="chev" size={20} /></span></a>
      </div>
      <div className="card fm-share">
        <b>What stays private</b>
        <p className="sub">Health readings and records are private. Only {first}, the people who care for {first}, and the admins can see them.</p>
      </div>
    </>
  )
}
