import type { ReactNode } from 'react'
import './v13.css'

/** An inset grouped list of Rows (contract 4). `icons` moves the hairline to 58 px, under the text. */
export function GroupedList(p: { children: ReactNode; icons?: boolean; testId?: string; label?: string }) {
  return <div className={p.icons ? 'grp ic' : 'grp'} role="list" aria-label={p.label} data-testid={p.testId}>{p.children}</div>
}
