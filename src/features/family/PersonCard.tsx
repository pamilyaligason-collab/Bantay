import { useState } from 'react'
import { logDose } from '../log/store'
import { shortName } from '../inbox/build'
import FamilyAnswer from './FamilyAnswer'
import { faceName } from './FacesRow'
import FmAvatar from './FmAvatar'
import { messagePrefill } from './Messages'
import { dial } from './roster'
import type { PersonFocus } from './useFocuses'
import './v13-family.css'

/** One person in the Today carousel: face, the one thing to know, and one action. aria-label keeps the roll-call words (name, check-in, status) for screen readers. */
export function PersonCard({ item, selfName, onNote }: { item: PersonFocus; selfName: string; onNote: (t: string) => void }) {
  const { person: p, focus: f } = item
  const [ask, setAsk] = useState(false)
  const [answering, setAnswering] = useState(false)
  const name = p.isMe ? 'You' : faceName(p.name)
  const open = `#family/people/${p.id}`
  const mark = async () => {
    for (const d of item.missedDoses) await logDose(d.med, d.slot)
    setAsk(false)
    onNote(`Marked as taken for ${shortName(p.name) ?? name}.`)
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
      {ask ? (
        <div className="pc-confirm" role="alertdialog" aria-label="Confirm">
          <b>Did you see {shortName(p.name) ?? name} take {item.missedDoses.length === 1 ? 'it' : 'them'}?</b>
          <div className="pc-actions">
            <button type="button" className="btn pc-btn" onClick={() => void mark()}>Yes, I saw</button>
            <button type="button" className="btn pc-btn" onClick={() => setAsk(false)}>Not sure</button>
          </div>
        </div>
      ) : (
        <div className="pc-actions">
          {a && a.kind === 'mark' && <button type="button" className="btn pc-btn pc-primary" onClick={() => setAsk(true)}>{a.label}</button>}
          {a && a.kind === 'answer' && <button type="button" className="btn pc-btn pc-primary" onClick={() => setAnswering(true)}>{a.label}</button>}
          {a && a.kind === 'message' && <button type="button" className="btn pc-btn pc-primary" onClick={talk}>{a.label}</button>}
          {a && a.kind === 'call' && <a className="btn pc-btn pc-primary" href={`tel:${dial(p.phone) ?? ''}`}>{a.label}</a>}
          {(a?.kind !== 'open') && <a className="btn pc-btn" href={open}>Open</a>}
          {a?.kind === 'open' && <a className="btn pc-btn" href={open}>{a.label}</a>}
        </div>
      )}
      {answering && asks[0] && <FamilyAnswer name={shortName(p.name) ?? name} med={asks[0].med} by={selfName} onClose={() => setAnswering(false)} onDone={onNote} />}
    </article>
  )
}
