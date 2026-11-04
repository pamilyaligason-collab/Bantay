import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'

/** One My day row (board Main): a 32 px icon tile (or `lead`, a control that takes its place), title, one sub line, then the row's control. `onMain` makes the text itself a button. */
export function Todo({ icon, tint, title, sub, children, lead, testId, onMain, mainLabel }: { icon: IconName; tint: string; title: string; sub: string; children?: ReactNode; lead?: ReactNode; testId?: string; onMain?: () => void; mainLabel?: string }) {
  const text = <><div className="rw-title">{title}</div><div className="rw-sub">{sub}</div></>
  const inline = <><span className="rw-title td-blk">{title}</span><span className="rw-sub td-blk">{sub}</span></>
  return (
    <div className="td-todo" data-testid={testId}>
      {lead ?? <span className="td-todo-ic" data-tint={tint}><Icon name={icon} size={18} /></span>}
      {onMain ? <button type="button" className="td-grow td-todo-main" aria-label={mainLabel} onClick={onMain}>{inline}</button> : <div className="td-grow">{text}</div>}
      {children}
    </div>
  )
}
