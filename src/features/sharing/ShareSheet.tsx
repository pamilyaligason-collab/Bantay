import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { setShare, shareCandidatesFor, shareCopy, type Candidate } from './api'
import './sharing.css'

/** "Allow someone" (boards D109Mine and D109Person): pick a family member, see what a link gives, allow it. It works at once; the person is told and can stop it.
 *  Who may open it: the person on themself, the family owner, or a writer carer of a person with no login (0046).
 *  `own`: the records are mine (the sheet says "your"); otherwise they are `name`'s, set by the family owner or by a writer carer of a person with no login.
 *  There is no carer box: making someone a carer (can_write) is the family owner's job on the web admin page, for a person with no login (0046). */
export function ShareSheet({ personId, own = true, name, onClose, onSent }: { personId: string; own?: boolean; name?: string; onClose: () => void; onSent: () => void }) {
  const [list, setList] = useState<Candidate[] | null | 'refused' | undefined>(undefined) // undefined = loading, null = could not load, 'refused' = the server said no
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => { setList(undefined); void shareCandidatesFor(personId).then(setList) }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  const who = Array.isArray(list) ? list.find((c) => c.carerUserId === pick) : undefined
  const title = own ? 'Share with someone' : 'Allow someone'
  const whose = own ? 'your' : `${name ?? 'this person'}'s`
  const allow = async () => {
    if (!who) return
    setBusy(true); setErr('')
    const r = await setShare(personId, who.carerUserId, true, false)
    setBusy(false)
    if (r === 'added' || r === 'updated' || r === 'unchanged') { onSent(); return }
    setErr(r === 'offline' || r === 'refused' || r === 'limit' ? shareCopy(r) : shareCopy('refused'))
  }
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet sh-card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">{title}</h2>
        <div className="sg-lab">1 · Who</div>
        {list === undefined ? <p className="sh-sub" role="status">Loading the family.</p>
          : list === 'refused' ? <p className="sh-sub" role="alert">{shareCopy('refused')}</p>
          : list === null ? <p className="sh-sub" role="alert">{shareCopy('offline')} <button type="button" className="sh-pill sh-ghost sh-small" onClick={load}>Try again</button></p>
          : list.length === 0 ? <p className="sh-sub">Everyone in the family can already see {whose} records.</p>
          : (
            <div className="sg-chips" role="group" aria-label="Who">
              {list.map((c) => <button key={c.carerUserId} type="button" className="sg-chip" aria-pressed={pick === c.carerUserId} onClick={() => setPick(c.carerUserId)}>{c.displayName}</button>)}
            </div>
          )}
        <div className="sh-sub">Only people already in the family appear here.</div>
        <div className="sg-lab">2 · What they can see</div>
        <div className="sg-see"><span>Medicines and doses</span><span>Readings, papers and check-ins</span><span>Food, water and phone health</span></div>
        {err && <p className="sh-sub" role="alert">{err}</p>}
        <button type="button" className="sh-pill sh-primary sh-block" disabled={!who || busy} onClick={() => void allow()}>{who ? `Allow ${who.displayName}` : 'Allow'}</button>
        <div className="sg-info"><span>Allowing works at once. {who ? who.displayName : 'They'} can see {whose} records now.{own ? '' : ' They are told, or their carers if they have no login.'} You can stop sharing any time.</span></div>
        <button type="button" className="sh-pill sh-ghost sh-block" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

export default ShareSheet
