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

/** Today's "Take a breath" row, the same Todo row as the others (T10). Start opens the BreathSheet; the log stays on this phone (kv selfcare.log). */
export default function SelfCare() {
  const [log] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [open, setOpen] = useState(false)
  const p = SHOWN_PATTERNS[0]!
  return (
    <div className="td-todo" data-testid="selfcare" id="myday-breath">
      <span className="td-todo-ic" data-tint="teal"><Icon name="wind" size={18} /></span>
      <div className="td-grow"><h2 className="rw-title td-sc-h">Take a breath</h2><div className="rw-sub">1 minute · {p.tag.toLowerCase()} · last: {lastLine(log.length ? log[log.length - 1]! : null)}</div></div>
      <button type="button" className="btn2 td-todo-go" aria-label="Start breathing" onClick={() => setOpen(true)}>Start</button>
      {open && <BreathSheet onClose={() => setOpen(false)} />}
    </div>
  )
}
