import { useEffect, useRef, useState } from 'react'
import { givenName } from '../health/medName'
import { JackArt, Skeleton } from '../look'
import { Icon } from '../shell/Icon'
import { checkIn, FAIL_TEXT } from '../today/actions'
import { StormRollCall } from './StormRollCall'
import FmAvatar from './FmAvatar'
import { bubbleStatus } from './messagesLogic'
import Messages from './Messages'
import './messages.css'
import { checkInLabel, nudgeFor, rollCall, useCheckInsLoaded, useFamilyPeople } from './roster'
import './family.css'
import LearningHub from './LearningHub'
import Memories from './Memories'
import { useFlagLines } from './reportData'
import { CarerCards } from './CarerCards'
import FamilyPhones from './FamilyPhones'
import { IncomingSos, useSosActive } from './IncomingSos'
import { AcceptCard } from '../sharing/AcceptCard'


/** The words under a picture: today's check-in ("OK 7:40 AM"), else when they were last OK ("Last OK yesterday", "Last OK 3 days ago", "Last OK 12 Oct"), else "No check-in yet". */
export function lastCheckInWords(iso: string | undefined, now: Date = new Date()): string {
  const t = iso ? new Date(iso) : null
  if (!t || Number.isNaN(t.getTime())) return 'No check-in yet'
  const today = checkInLabel(iso, now)
  if (today.ok) return today.text
  const day = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
  const n = day(now) - day(t)
  if (n < 1) return 'No check-in yet' // a time in the future is not a check-in
  if (n === 1) return 'Last OK yesterday'
  return n < 7 ? `Last OK ${n} days ago` : `Last OK ${t.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()]}`
}

/** Family > People (mockup v6): today's check-in, then the roll call. Each row: picture, name, one status line. The phone health data switches live in Me. */
export default function People() {
  const { people, selfId } = useFamilyPeople()
  const sos = useSosActive() // no Jack beside a live SOS banner (D-91)
  const loaded = useCheckInsLoaded()
  const last = loaded ?? {}
  const [note, setNote] = useState('')
  const [okAt, setOkAt] = useState<string | null>(null) // set after the check-in is saved: the button morphs into "You're OK · h:mm", then the card settles
  const [talk, setTalk] = useState<string | null>(null)
  const [phones, setPhones] = useState(false) // Family > Phones, shown in place of the roll call
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 4000)
    return () => clearTimeout(t)
  }, [note])
  const flags = useFlagLines(people)
  const rc = rollCall(people, last)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => { if (okAt) card.current?.focus() }, [okAt]) // the button is gone now: keep focus on the card
  const selfAt = selfId && loaded && checkInLabel(loaded[selfId]).ok ? checkInLabel(loaded[selfId]).text.replace(/^OK /, '') : null
  const doneAt = okAt ?? selfAt
  const imOk = async () => {
    const r = await checkIn()
    if (r === 'ok') setOkAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) // only after the write succeeded
    setNote(r === 'ok' ? 'The family can see you are OK.' : FAIL_TEXT[r])
  }

  const messageSheet = (() => {
    const w = people.find((p) => p.id === talk)
    if (!w) return null
    const n = loaded !== null ? nudgeFor(w, checkInLabel(last[w.id]).ok) : null
    return <Messages who={w} people={people} nudge={n ? { text: n.text, href: n.href } : null} onClose={() => setTalk(null)} onOpenPage={() => { location.hash = `family/people/${w.id}` }} />
  })()

  if (phones) {
    return (
      <>
        <FamilyPhones people={people.filter((p) => !p.isMe)} onBack={() => setPhones(false)} onMessage={setTalk} />
        {messageSheet}
      </>
    )
  }

  return (
    <>
      <AcceptCard />
      <IncomingSos placement="family" />
      <StormRollCall /> {/* shows itself only while a PAGASA wind signal is live */}
      <CarerCards onMessage={setTalk} onPhones={() => setPhones(true)} onNote={setNote} />
      <div className="card fm-checkin" ref={card} tabIndex={-1}>
        {doneAt ? (
          <>
            <span className="tile" aria-hidden="true"><Icon name="check" size={24} /></span>
            <div className="grow">
              <b className="fm-okdone">You're OK · {doneAt}</b>
              <span className="sub"> Your family can see it.</span>
            </div>
            {okAt && !sos && <JackArt name="well-done" size={72} decorative />}
          </>
        ) : (
          <>
            <div className="grow">
              <b>Today's check-in</b>
              <span className="sub">{loaded === null ? ' ' : rc.total ? `${rc.ok} of ${rc.total} OK today` :'Nobody has checked in yet'}</span>
            </div>
            <button type="button" className="pill primary" onClick={() => void imOk()} disabled={!selfId}>I'm OK</button>
          </>
        )}
      </div>

      {loaded === null ? (
        <section aria-busy="true" aria-label="Family roll call">
          <Skeleton lines={3} />
          <p className="sub fm-key">Loading your family…</p>
        </section>
      ) : people.length === 0 ? (
        <div className="card"><p className="sub fm-empty">Your family shows here after the app has synced once. Connect to the internet and open the app.</p></div>
      ) : (
        <>
          <ul className="card fm-bubbles" aria-label="Family roll call">
            {people.map((p) => {
              const c = checkInLabel(last[p.id])
              const known = loaded !== null // before the first read there is no status, never a wrong one
              const st = bubbleStatus({ checkedIn: known && c.ok, flag: flags[p.id] ?? null })
              const words = st.key === 'quiet' ? lastCheckInWords(last[p.id]) : st.key === 'ok' ? c.text : st.word // S9: last check-in in words, not a sleep icon
              return (
                <li key={p.id}>
                  <button type="button" className="fm-bubble press" data-k={known ? st.key : 'quiet'} onClick={() => { location.hash = `family/people/${p.id}` }} aria-label={known ? `${p.name}${p.isMe ? ' (you)' : ''}, ${c.text}, ${st.key === 'quiet' ? words : st.word}${flags[p.id] ? `, ${flags[p.id]}` : ''}. Open page` : `${p.name}${p.isMe ? ' (you)' : ''}${flags[p.id] ? `, ${flags[p.id]}` : ''}. Open page`}>
                    <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={64} />
                    {known && st.key !== 'quiet' && <span className="fm-emo" aria-hidden="true" data-testid="bubble-emoji">{st.emoji}</span>}
                    <b>{p.isMe ? 'You' : givenName(p.name)}</b>
                    {known && <span className="sub">{words}</span>}
                    {flags[p.id] && <span className="fm-flag" data-testid="flag-line">{flags[p.id]}</span>}
                  </button>
                  {!p.isMe && <button type="button" className="fm-bubble-msg" onClick={() => setTalk(p.id)} aria-label={`Message ${givenName(p.name)}`}>Message</button>}
                </li>
              )
            })}
          </ul>
          <p className="sub fm-key">✅ OK today &nbsp; ⚠️ Needs a look. Tap a picture to open the person, or Message to talk.</p>
        </>
      )}
      <LearningHub />
      <Memories />
      {messageSheet}
      {note && <div className="toast" role="status">{note}</div>}
    </>
  )
}
