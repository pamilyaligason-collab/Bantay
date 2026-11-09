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
import type { PersonFocus } from './useFocuses'
import './v13-family.css'

/** Missed is judged from what this phone holds, so a take that has not synced still reads as missed: say how old the data is. */
function SyncedLine() {
  const at = useKvValue<number>(LAST_ONLINE_KEY)
  return <p className="pc-sync" data-testid="pc-sync">{typeof at === 'number' ? `Last synced ${agoShort(at, Date.now())}` : 'Not synced yet on this phone'}</p>
}

/** The one-tap actions of a person's People card (S26 D-168: the Family Today list is gone, its carer actions live on the card): "Mark taken" with its "Did you see them take it?" confirm, and "Answer" for a "Still taking it?" question. Renders nothing for any other focus. */
export function FocusActions({ item, selfName, onNote }: { item: PersonFocus; selfName: string; onNote: (t: string) => void }) {
  const { person: p, focus: f } = item
  const [ask, setAsk] = useState(false)
  const [answering, setAnswering] = useState(false)
  const name = p.isMe ? 'You' : faceName(p.name)
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
  const a = f.action
  if (!a || (a.kind !== 'mark' && a.kind !== 'answer')) return null
  return (
    <div className="pc-focus">
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
          {a.kind === 'mark' && <button type="button" className="btn pc-btn pc-primary" onClick={() => setAsk(true)} aria-label={`${a.label} for ${name}`}>{a.label}</button>}
          {a.kind === 'answer' && <button type="button" className="btn pc-btn pc-primary" onClick={() => setAnswering(true)} aria-label={`${a.label} for ${name}`}>{a.label}</button>}
        </div>
      )}
      {answering && item.asks[0] && <FamilyAnswer name={shortName(p.name) ?? name} med={item.asks[0].med} by={selfName} onClose={() => setAnswering(false)} onDone={onNote} />}
    </div>
  )
}
