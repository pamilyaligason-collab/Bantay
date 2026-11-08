import { Children, useState, type ReactNode } from 'react'
import './v13.css'

/** S25 (D-156): replaces every side-swiping card row. A 2-column grid shows `step` cards (4), "Show N more" adds `step` at a time, "Show less" folds back.
 *  Children are the cards; each card fills its cell (no fixed widths). */
export function MoreGrid(p: { children: ReactNode; label: string; testId?: string; step?: number; moreLabel?: (n: number) => string }) {
  const step = p.step ?? 4
  const items = Children.toArray(p.children)
  const [shown, setShown] = useState(step)
  const left = items.length - shown
  const next = Math.min(step, left)
  return (
    <div className="more-grid-wrap" data-testid={p.testId}>
      <div className="more-grid" role="group" aria-label={p.label}>{items.slice(0, shown)}</div>
      {left > 0 && <button type="button" className="more-grid-btn" onClick={() => setShown(shown + step)}>{p.moreLabel ? p.moreLabel(next) : `Show ${next} more`}</button>}
      {left <= 0 && items.length > step && <button type="button" className="more-grid-btn" onClick={() => setShown(step)}>Show less</button>}
    </div>
  )
}
