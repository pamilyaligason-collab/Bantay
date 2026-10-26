import { useEffect, useState } from 'react'
import { checkIn, FAIL_TEXT } from '../today/actions'
import FmAvatar from './FmAvatar'
import { bubbleStatus } from './messagesLogic'
import Messages from './Messages'
import './messages.css'
import { checkInLabel, nudgeFor, rollCall, useCheckInsLoaded, useFamilyPeople } from './roster'
import './family.css'
import LearningHub from './LearningHub'
import Memories from './Memories'
import { useFlagLines } from './reportData'

/** Family > People (mockup v6): today's check-in, then the roll call. Each row: picture, name, one status line. The phone health data switches live in Me. */
export default function People() {
  const { people, selfId } = useFamilyPeople()
  const loaded = useCheckInsLoaded()
  const last = loaded ?? {}
  const [note, setNote] = useState('')
  const [talk, setTalk] = useState<string | null>(null)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 4000)
    return () => clearTimeout(t)
  }, [note])
  const flags = useFlagLines(people)
  const rc = rollCall(people, last)
  const imOk = async () => {
    const r = await checkIn()
    setNote(r === 'ok' ? 'The family can see you are OK.' : FAIL_TEXT[r])
  }

  return (
    <>
      {!(selfId && loaded && checkInLabel(loaded[selfId]).ok) && (
        <div className="card fm-checkin">
          <div className="grow">
            <b>Today's check-in</b>
            <span className="sub">{loaded === null ? ' ' : rc.total ? `${rc.ok} of ${rc.total} OK today` : 'Nobody has checked in yet'}</span>
          </div>
          <button type="button" className="pill primary" onClick={() => void imOk()} disabled={!selfId}>I'm OK</button>
        </div>
      )}

      {people.length === 0 ? (
        <div className="card"><p className="sub fm-empty">Your family shows here after the app has synced once. Connect to the internet and open the app.</p></div>
      ) : (
        <>
          <ul className="card fm-bubbles" aria-label="Family roll call">
            {people.map((p) => {
              const c = checkInLabel(last[p.id])
              const known = loaded !== null // before the first read there is no status, never a wrong one
              const st = bubbleStatus({ checkedIn: known && c.ok, flag: flags[p.id] ?? null })
              return (
                <li key={p.id}>
                  <button type="button" className="fm-bubble" data-k={known ? st.key : 'quiet'} onClick={() => setTalk(p.id)} aria-label={known ? `${p.name}${p.isMe ? ' (you)' : ''}, ${c.text}, ${st.word}${flags[p.id] ? `, ${flags[p.id]}` : ''}. Open messages` : `${p.name}${p.isMe ? ' (you)' : ''}${flags[p.id] ? `, ${flags[p.id]}` : ''}. Open messages`}>
                    <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={64} />
                    {known && <span className="fm-emo" aria-hidden="true" data-testid="bubble-emoji">{st.emoji}</span>}
                    <b>{p.isMe ? 'You' : p.name.trim().split(/\s+/)[0]}</b>
                    {known && <span className="sub">{st.word}</span>}
                    {flags[p.id] && <span className="fm-flag" data-testid="flag-line">{flags[p.id]}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="sub fm-key">✅ OK today &nbsp; ⚠️ Needs a look &nbsp; 💤 No news. Tap a picture to message.</p>
        </>
      )}
      <LearningHub />
      <Memories />
      {(() => {
        const w = people.find((p) => p.id === talk)
        if (!w) return null
        const n = loaded !== null ? nudgeFor(w, checkInLabel(last[w.id]).ok) : null
        return <Messages who={w} people={people} nudge={n ? { text: n.text, href: n.href } : null} onClose={() => setTalk(null)} onOpenPage={() => { location.hash = `family/people/${w.id}` }} />
      })()}
      {note && <div className="toast" role="status">{note}</div>}
    </>
  )
}
