import { useId, type ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'

/** One My day row (board Main): a 32 px icon tile (or `lead`, a control that takes its place), title, one sub line, then the row's control. `onMain` makes the text itself a button.
 *  `due` adds the still Due pill after the title (a button row says it as its description, so its name stays); `move` lets the icon and control animate once (D-125). */
export function Todo({ icon, tint, title, sub, children, lead, testId, onMain, mainLabel, due, move, badge }: { icon: IconName; tint: string; title: string; sub: string; children?: ReactNode; lead?: ReactNode; testId?: string; onMain?: () => void; mainLabel?: string; due?: boolean; move?: boolean; badge?: number }) {
  const pid = useId()
  const num = badge ? <span className="td-pri" aria-hidden="true">{badge}</span> : null // S22-B: the fixed priority number
  const pill = due ? <span className="nd-due" id={pid}>Due</span> : null
  const cls = due ? ' nd-has' : ''
  const text = <><div className={`rw-title${cls}`}>{num}{title}{pill}</div><div className="rw-sub">{sub}</div></>
  const inline = <><span className={`rw-title td-blk${cls}`}>{num}{title}{pill}</span><span className="rw-sub td-blk">{sub}</span></>
  return (
    <div className="td-todo" data-testid={testId} data-nudge={due && move ? 'move' : undefined}>
      {lead ?? <span className="td-todo-ic" data-tint={tint}><Icon name={icon} size={18} /></span>}
      {onMain ? <button type="button" className="td-grow td-todo-main" aria-label={mainLabel} aria-describedby={due ? pid : undefined} onClick={onMain}>{inline}</button> : <div className="td-grow">{text}</div>}
      {children}
    </div>
  )
}
