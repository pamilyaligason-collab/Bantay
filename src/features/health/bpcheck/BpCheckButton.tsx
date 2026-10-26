import { useState } from 'react'
import BpCheck from './BpCheck'
import './bpcheck.css'

/** The "Guided check" button (S7 mounts it in QuickLog; MetricScreen mounts it on the blood pressure page). Opens the two-reading check for one person. */
export default function BpCheckButton({ personId, forName, doctor, onSaved, className = 'pill ghost' }: { personId: string; forName: string; doctor?: string; onSaved?: (msg: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Guided check</button>
      {open && <BpCheck personId={personId} forName={forName} doctor={doctor} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  )
}
