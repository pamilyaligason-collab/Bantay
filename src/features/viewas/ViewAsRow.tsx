import { useEffect, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { getMember } from '../auth/session'
import { useFamilyPeople } from '../family/roster'
import { Row } from '../look/Row'
import { enterActing, exitActing, useActing } from './viewAs'
import './viewas.css'

/** Settings row + picker sheet (C-9). Admin only; the roster is everyone this phone knows except the admin (you cannot act as yourself, r3-4).
 *  Switching needs internet because the audit row (admin_log_view_as) must be written first. */
export default function ViewAsRow(): ReactElement | null {
  const [admin, setAdmin] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const { people, selfId } = useFamilyPeople()
  const { acting, name } = useActing()
  useEffect(() => {
    let live = true
    void getMember().then((m) => { if (live) setAdmin(m?.role === 'admin') }, () => undefined)
    return () => { live = false }
  }, [])
  if (!admin) return null
  const others = people.filter((p) => p.id !== selfId && !p.isMe)
  const pick = async (id: string) => {
    if (busy) return
    setBusy(id); setErr('')
    const ok = await enterActing(id)
    setBusy(null)
    if (ok) setOpen(false)
    else setErr('Could not switch. Check your internet and try again.')
  }
  return (
    <>
      <Row icon="eye" title="View as" sub={acting ? `Acting as ${name}` : 'See and log for a family member'} onClick={() => setOpen(true)} testId="viewas-row" />
      {open && createPortal(
        <div className="va-sheet-wrap" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="va-sheet" role="dialog" aria-modal="true" aria-label="View as" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <h2>View as</h2>
            <p>Needs internet to switch. Every view is recorded in the family history.</p>
            {others.length === 0 && <p>No one else is on this phone yet.</p>}
            {others.map((p) => <button key={p.id} type="button" className="va-pick" disabled={!!busy} onClick={() => void pick(p.id)}>{p.name}</button>)}
            {err && <p role="alert">{err}</p>}
            {acting && <button type="button" className="btn2" onClick={() => { exitActing(); setOpen(false) }}>Exit {name}</button>}
            <button type="button" className="btn2" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>,
        document.querySelector('.bt') ?? document.body
      )}
    </>
  )
}
