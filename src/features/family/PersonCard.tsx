import { useRef, useState } from 'react'
import { logDose } from '../log/store'
import { markSeen } from '../notify/store'
import { useKvValue } from '../phonecheck/useKvValue'
import { LAST_ONLINE_KEY } from '../sync/useOffline'
import { agoShort } from '../today/alertRow'
import { shortName } from '../inbox/build'
import { shortMedName } from '../health/medName'
import FamilyAnswer from './FamilyAnswer'
import { faceName } from './FacesRow'
import FmAvatar from './FmAvatar'
import { messagePrefill } from './Messages'
import { dial } from './roster'
import type { PersonFocus } from './useFocuses'
import './v13-family.css'

/** Missed is judged from what this phone holds, so a take that has not synced still reads as missed: say how old the data is. */
function SyncedLine() {
  const at = useKvValue<number>(LAST_ONLINE_KEY)
  return <p className="pc-sync" data-testid="pc-sync">{typeof at === 'number' ? `Last synced ${agoShort(at, Date.now())}` : 'Not synced yet on this phone'}</p>
}

/** One person in the Today carousel: face, the one thing to know, and one action. aria-label keeps the roll-call words (name, check-in, status) for screen readers. */
export function PersonCard({ item, selfName, onNote }: { item: PersonFocus; selfName: string; onNote: (t: string) => void }) {
  const { person: p, focus: f } = item
  const [ask, setAsk] = useState(false)
  const [answering, setAnswering] = useState(false)
  const name = p.isMe ? 'You' : faceName(p.name)
  const open = `#family/people/${p.id}`
  const marking = useRef(false) // a fast double tap on "Yes, I saw" must write one dose, not two
  const mark = async () => {
    if (marking.current) return
    const d = item.missedDoses[0]
    if (!d) return setAsk(false)
    marking.current = true
    try {
      await logDose(d.med, d.slot) // one tap marks ONE dose (ML-13)
      if (item.missedDoses.length === 1) for (const id of item.alertIds) void markSeen(id).catch(() => undefined)
      onNote(`Marked as taken for ${shortName(p.name) ?? name}.`)
    } catch {
      onNote('Could not save on this phone. Try again.')
    } finally { marking.current = false }
    setAsk(false)
  }
  const talk = () => { if (!p.isMe) messagePrefill.text = `@${faceName(p.name)} `; location.hash = 'family/messages' }
  const a = f.action
  const asks = item.asks
  return (
    <article className="pc card" data-tint={f.tint} data-kind={f.kind} data-testid="person-card" aria-label={`${p.name}${p.isMe ? ' (you)' : ''}. ${f.line}`}>
      <div className="pc-top">
        <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={44} />
        <div className="pc-who"><b>{name}</b><span className="pc-line">{f.line}</span></div>
      </div>
      <p className="pc-body">{f.body}</p>
      {f.kind === 'missed' && <SyncedLine />}
      {ask ? (
        <div className="pc-confirm" role="alertdialog" aria-label="Confirm">
          <b>Did you see {shortName(p.name) ?? name} take {item.missedDoses[0] ? `${shortMedName(item.missedDoses[0].med.name)} at ${item.missedDoses[0].time}` : 'it'}?</b>
          <div className="pc-actions">
            <button type="button" className="btn pc-btn" onClick={() => void mark()}>Yes, I saw</button>
            <button type="button" className="btn pc-btn" onClick={() => setAsk(false)}>Not sure</button>
          </div>
        </div>
      ) : (
        <div className="pc-actions">
          {a && a.kind === 'mark' && <button type="button" className="btn pc-btn pc-primary" onClick={() => setAsk(true)} aria-label={`${a.label} for ${name}`}>{a.label}</button>}
          {a && a.kind === 'answer' && <button type="button" className="btn pc-btn pc-primary" onClick={() => setAnswering(true)} aria-label={`${a.label} for ${name}`}>{a.label}</button>}
          {a && a.kind === 'message' && <button type="button" className="btn pc-btn pc-primary" onClick={talk}>{a.label}</button>}
          {a && a.kind === 'call' && <a className="btn pc-btn pc-primary" href={`tel:${dial(p.phone) ?? ''}`}>{a.label}</a>}
          {(a?.kind !== 'open') && <a className="btn pc-btn" href={open} aria-label={`Open ${name}`}>Open</a>}
          {a?.kind === 'open' && <a className="btn pc-btn" href={open} aria-label={`Open ${name}`}>{a.label}</a>}
        </div>
      )}
      {answering && asks[0] && <FamilyAnswer name={shortName(p.name) ?? name} med={asks[0].med} by={selfName} onClose={() => setAnswering(false)} onDone={onNote} />}
    </article>
  )
}
