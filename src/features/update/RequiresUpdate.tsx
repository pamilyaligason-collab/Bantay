import { useState } from 'react'
import { MASCOT_SRC } from '../../assets/mascot'
import '../shell/shell.css'
import './update.css'
import { UpdateSheet } from './UpdateSheet'
import { useUpdate } from './useUpdate'

/** Full screen, only when this app is older than latest.json's minShell (breaking shell change, D-50). */
export function RequiresUpdate() {
  const u = useUpdate()
  const [open, setOpen] = useState(false)
  if (u.decision.kind !== 'required') return null
  const l = u.decision.latest
  return (
    <div className="sh up-gate" role="alertdialog" aria-modal="true" aria-label="Update needed" aria-describedby="up-gate-d">
      <img src={MASCOT_SRC} alt="" width={110} height={110} />
      <h1 className="sh-h2">Please update Bantay</h1>
      <p id="up-gate-d" className="sh-sub">This version is too old to keep working. {l.notes} Your data and reminders are safe.</p>
      <button type="button" className="sh-pill sh-primary sh-block" onClick={() => setOpen(true)}>Update to {l.versionName}</button>
      {open && <UpdateSheet latest={l} onClose={() => setOpen(false)} />}
    </div>
  )
}
