import { useState } from 'react'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import '../shell/shell.css'
import './update.css'
import { fmtMB, onCellular, UpdateSheet } from './UpdateSheet'
import { useUpdate } from './useUpdate'

/** Today card (mockup "Update ready"). Shows only for a ready update; a required one is the full-screen RequiresUpdate. */
export function UpdateCard() {
  const u = useUpdate()
  const [open, setOpen] = useState(false)
  const [wifiOnly] = useKv<boolean>('update.wifiOnly', true)
  if (u.decision.kind !== 'ready') return null
  const l = u.decision.latest
  return (
    <>
      <div className="sh up-cardrow" role="region" aria-label="Update ready">
        <Icon name="dl" />
        <div className="sh-grow">
          <b>Update ready</b>
          <div className="sh-sub">Bantay {l.versionName} · {fmtMB(l.size)} MB · {wifiOnly && onCellular() ? 'Waiting for Wi-Fi' : 'you can keep using Bantay'}</div>
        </div>
        <button type="button" className="sh-pill sh-ghost sh-small up-card" onClick={() => setOpen(true)}>Update</button>
      </div>
      {open && <UpdateSheet latest={l} onClose={() => setOpen(false)} />}
    </>
  )
}
