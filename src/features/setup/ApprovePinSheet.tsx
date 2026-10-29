import { useEffect, useRef, useState } from 'react'
import { approveReset } from '../auth/pinReset'
import { loadFamily } from '../auth/family'
import { markSeen } from '../notify/store'
import { useAlertRows } from '../notify/useAlerts'
import PinPad from './PinPad'
import './setup.css'

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** `start-approve-req`: the sheet a family admin sees over their own app when someone asks for a new PIN (a `pin_approve` row from the alert store, `ref` = request id).
 *  Contract: the approver types the 4-digit number the requester reads out; the server checks it (approve_pin_reset), 5 wrong numbers burn the request, first Approve wins.
 *  The number is never in the row, so seeing the sheet is not enough to approve. Mount it once near the top of Today (S7 hook). */
export default function ApprovePinSheet({ approve = approveReset }: { approve?: typeof approveReset }) {
  const rows = useAlertRows()
  const row = rows.find((r) => r.kind === 'pin_approve' && r.seenAt == null && r.ref)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (row) box.current?.focus() }, [row?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!row && !done) return null
  const who = row?.personId ? loadFamily().find((m) => m.personId === row.personId) : null
  const name = who?.displayName.split(' ')[0] ?? 'Someone'
  const close = () => { if (row) void markSeen(row.id); setMsg(''); setDone(false) }
  const ok = async (code: string) => {
    if (!row?.ref || busy) return
    setBusy(true); setMsg('')
    const r = await approve(row.ref, code)
    setBusy(false)
    if (r === 'approved') { await markSeen(row.id); setDone(true) }
    else setMsg(r === 'no_signal' ? 'No signal. Try again when you have data.' : `That number did not work. Ask ${name} to read it again.`)
  }
  return (
    <div className="ap-back">
      <div ref={box} className="glass ap-sheet" role="dialog" aria-modal="true" aria-labelledby="ap-t" tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div className="ap-grab" aria-hidden="true" />
        {done ? (
          <>
            <h2 id="ap-t" className="h2">Approved</h2>
            <p className="sub" role="status">{name} can now choose a new PIN on their phone.</p>
            <button type="button" className="btn" onClick={close}>Done</button>
          </>
        ) : (
          <>
            <div className="ap-who">
              <span className="avatar big" aria-hidden="true">{(who?.initials ?? name.slice(0, 1)).toUpperCase()}</span>
              <div><h2 id="ap-t" className="h2">{name} wants a new PIN</h2><span className="sub">Asked {clock(row!.createdAt)}</span></div>
            </div>
            <p className="sub" style={{ margin: 0 }}>Ask {name} for the 4-digit number on their screen, then type it here.</p>
            <PinPad length={4} label="numbers" busy={busy} onDone={(c) => void ok(c)} />
            {msg && <p className="si-bad" role="alert">{msg}</p>}
            <button type="button" className="btn2" onClick={close}>Not {name}, do not approve</button>
            <p className="sub" style={{ margin: 0, textAlign: 'center' }}>Approving lets them choose a new PIN. It does not show their records to anyone else.</p>
          </>
        )}
      </div>
    </div>
  )
}
