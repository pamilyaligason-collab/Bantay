import { Children, useState, type ReactNode } from 'react'

/** One column of media cards with --card-gap between them, `step` shown (4) and "Show N more" / "Show less" (D-156: no side-swipe rows). Not a card itself. */
export function MediaList(p: { children: ReactNode; label: string; testId?: string; step?: number }) {
  const step = p.step ?? 4
  const items = Children.toArray(p.children)
  const [shown, setShown] = useState(step)
  const left = items.length - shown
  return (
    <div className="md-listwrap" data-testid={p.testId}>
      <div className="md-list" role="group" aria-label={p.label}>{items.slice(0, shown)}</div>
      {left > 0 && <button type="button" className="more-grid-btn" onClick={() => setShown(shown + step)}>{`Show ${Math.min(step, left)} more`}</button>}
      {left <= 0 && items.length > step && <button type="button" className="more-grid-btn" onClick={() => setShown(step)}>Show less</button>}
    </div>
  )
}
