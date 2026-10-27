import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { setShare, shareCandidates, shareCopy, type Candidate } from './api'
import './sharing.css'

/** "Share with someone" (canvas board 1c): pick a family member, see what sharing gives, send the offer. The person sees nothing until they accept.
 *  The carer box is shown but off: only an admin can make someone a carer (can_write), and only for a person with no login (0037). */
export function ShareSheet({ personId, onClose, onSent }: { personId: string; onClose: () => void; onSent: () => void }) {
  const [list, setList] = useState<Candidate[] | null | undefined>(undefined) // undefined = loading, null = could not load
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => { setList(undefined); void shareCandidates().then(setList) }
  useEffect(load, [])
  const who = list?.find((c) => c.carerUserId === pick)
  const send = async () => {
    if (!who) return
    setBusy(true); setErr('')
    const r = await setShare(personId, who.carerUserId, true, false)
    setBusy(false)
    if (r === 'pending' || r === 'unchanged') { onSent(); return }
    setErr(r === 'offline' || r === 'refused' || r === 'limit' ? shareCopy(r) : shareCopy('refused'))
  }
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet sh-card" role="dialog" aria-modal="true" aria-label="Share with someone" onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">Share with someone</h2>
        <div className="sg-lab">1 · Who</div>
        {list === undefined ? <p className="sh-sub" role="status">Loading the family.</p>
          : list === null ? <p className="sh-sub" role="alert">{shareCopy('offline')} <button type="button" className="sh-pill sh-ghost sh-small" onClick={load}>Try again</button></p>
          : list.length === 0 ? <p className="sh-sub">Everyone in the family can already see your records, or has an offer waiting.</p>
          : (
            <div className="sg-chips" role="group" aria-label="Who">
              {list.map((c) => <button key={c.carerUserId} type="button" className="sg-chip" aria-pressed={pick === c.carerUserId} onClick={() => setPick(c.carerUserId)}>{c.displayName}</button>)}
            </div>
          )}
        <div className="sh-sub">Only people already in the family appear here.</div>
        <div className="sg-lab">2 · What they can see</div>
        <div className="sg-see"><span>Your medicines</span><span>Your blood pressure and other readings</span><span>Your papers</span></div>
        <label className="sg-check" aria-disabled="true">
          <input type="checkbox" disabled checked={false} readOnly />
          <span>Make {who ? who.displayName : 'them'} my carer, so they get missed-dose alerts<span className="sh-sub sh-blk">Only an admin can turn this on.</span></span>
        </label>
        {err && <p className="sh-sub" role="alert">{err}</p>}
        <button type="button" className="sh-pill sh-primary sh-block" disabled={!who || busy} onClick={() => void send()}>{who ? `Send to ${who.displayName}` : 'Send'}</button>
        <div className="sg-info"><span>{who ? who.displayName : 'They'} sees nothing until they tap Accept. You can stop sharing any time.</span></div>
        <button type="button" className="sh-pill sh-ghost sh-block" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

export default ShareSheet
