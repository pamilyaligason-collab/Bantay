import { useEffect, useState } from 'react'
import { checkIn, FAIL_TEXT } from '../today/actions'
import FmAvatar from './FmAvatar'
import { checkInLabel, nudgeFor, rollCall, useCheckIns, useFamilyPeople } from './roster'
import './family.css'

/** Family > People (mockup v6): today's check-in, then the roll call. Each row: picture, name, one status line. The phone health data switches live in Me. */
export default function People() {
  const { people, selfId } = useFamilyPeople()
  const last = useCheckIns()
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 4000)
    return () => clearTimeout(t)
  }, [note])
  const rc = rollCall(people, last)
  const imOk = async () => {
    const r = await checkIn()
    setNote(r === 'ok' ? 'The family can see you are OK.' : FAIL_TEXT[r])
  }

  return (
    <>
      <div className="card fm-checkin">
        <div className="grow">
          <b>Today's check-in</b>
          <span className="sub">{rc.total ? `${rc.ok} of ${rc.total} OK today` : 'Nobody has checked in yet'}</span>
        </div>
        <button type="button" className="pill primary" onClick={() => void imOk()} disabled={!selfId}>I'm OK</button>
      </div>

      {people.length === 0 ? (
        <div className="card"><p className="sub fm-empty">Your family shows here after the app has synced once. Connect to the internet and open the app.</p></div>
      ) : (
        <ul className="card list fm-roll" aria-label="Family roll call">
          {people.map((p) => {
            const c = checkInLabel(last[p.id])
            const nudge = nudgeFor(p, c.ok)
            return (
              <li key={p.id} className={nudge ? 'fm-has-nudge' : undefined}>
                <button type="button" className="fm-person" onClick={() => { location.hash = `family/people/${p.id}` }} aria-label={`${p.name}${p.isMe ? ' (you)' : ''}, ${c.text}. Open page`}>
                  <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={44} status={c.ok ? 'ok' : 'none'} />
                  <span className="grow">
                    <b>{p.name}{p.isMe ? ' (you)' : ''}</b>
                    {!nudge && <span className={`sub${c.ok ? '' : ' fm-warn'}`}>{c.text}</span>}
                  </span>
                  <svg className="fm-chev" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
                {nudge && <a className="fm-nudge" href={nudge.href} aria-label={nudge.label}>{nudge.text}</a>}
              </li>
            )
          })}
        </ul>
      )}
      {note && <div className="toast" role="status">{note}</div>}
    </>
  )
}
