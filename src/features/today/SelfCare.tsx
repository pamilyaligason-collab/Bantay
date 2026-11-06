import { Icon } from '../shell/Icon'
import { useActing } from '../viewas/viewAs'
import { useKv } from '../shell/useKv'
import { SHOWN_PATTERNS, type SelfCareEntry } from './breathLogic'
import './selfcare.css'

const lastLine = (last: SelfCareEntry | null, now = new Date()): string => {
  if (!last) return 'none yet'
  const d = new Date(last.at)
  if (d.toDateString() === now.toDateString()) return 'today'
  const y = new Date(now); y.setDate(y.getDate() - 1)
  return d.toDateString() === y.toDateString() ? 'yesterday' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })
}

/** Today's "Take a breath" row, the same Todo row as the others (T10). Start opens the full Calm screen (#calm, D-142); the log stays on this phone (kv selfcare.log). */
export default function SelfCare() {
  const [stored] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const log = useActing().acting ? [] : stored // the log is not by person: while viewing, the admin's breaths are not the viewed person's
  const p = SHOWN_PATTERNS[0]!
  return (
    <div className="td-todo" data-testid="selfcare" id="myday-breath">
      <span className="td-todo-ic" data-tint="teal"><Icon name="wind" size={18} /></span>
      <div className="td-grow"><h2 className="rw-title td-sc-h">Take a breath</h2><div className="rw-sub">1 minute · {p.tag.toLowerCase()} · last: {lastLine(log.length ? log[log.length - 1]! : null)}</div></div>
      <a href="#calm" className="btn2 td-todo-go" aria-label="Start breathing">Start</a>
    </div>
  )
}
