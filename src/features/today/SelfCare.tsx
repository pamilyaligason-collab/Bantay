import { useState } from 'react'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import BreathSheet from './BreathSheet'
import { SHOWN_PATTERNS, type SelfCareEntry } from './breathLogic'
import './selfcare.css'

const lastLine = (last: SelfCareEntry | null, now = new Date()): string => {
  if (!last) return 'none yet'
  const d = new Date(last.at)
  if (d.toDateString() === now.toDateString()) return 'today'
  const y = new Date(now); y.setDate(y.getDate() - 1)
  return d.toDateString() === y.toDateString() ? 'yesterday' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })
}

/** Today's "Take a breath" row (72 px, W-5). Start opens the BreathSheet; the log stays on this phone (kv selfcare.log). */
export default function SelfCare() {
  const [log] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [open, setOpen] = useState(false)
  const p = SHOWN_PATTERNS[0]!
  return (
    <section className="card td-sc" aria-labelledby="sc-h" data-testid="selfcare">
      <span className="hc-ic td-sc-ic"><Icon name="lungs" size={20} /></span>
      <div className="td-sc-t"><h2 className="td-sc-h" id="sc-h">Take a breath</h2><span className="td-sc-sub">{p.tag} · last: {lastLine(log.length ? log[log.length - 1]! : null)}</span></div>
      <button type="button" className="btn2 td-sc-go" aria-label="Start breathing" onClick={() => setOpen(true)}>Start</button>
      {open && <BreathSheet onClose={() => setOpen(false)} />}
    </section>
  )
}
