import { useState } from 'react'
import { createPortal } from 'react-dom'
import SosHold from '../sos/SosHold'
import SosScreen from '../sos/SosScreen'
import './today.css'

/** The hold-for-help button under a warning card. A live quake or storm card hides Jack (D-91, no Jack art), so SOS must stay reachable here.
 *  Same 3 s hold and the same full SOS screen as the Jack sheet. */
export default function NofabSos() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <section className="td-sos" aria-label="Emergency" data-testid="warning-sos"><SosHold onSend={() => setOpen(true)} /></section>
      {open && createPortal(<div className="sh-sosfull" data-testid="sos-full"><SosScreen onClose={() => setOpen(false)} /></div>, document.querySelector('.bt') ?? document.body)}
    </>
  )
}
