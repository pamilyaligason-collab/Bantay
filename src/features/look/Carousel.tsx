import type { ReactNode } from 'react'
import './v13.css'

/** Horizontal scroller that bleeds to the page edges, scroll-snap, no scrollbar (contract 4). Each child sets its own width. */
export function Carousel(p: { children: ReactNode; label: string; testId?: string; gap?: 12 | 16 }) {
  return <div className="carousel" role="group" aria-label={p.label} data-testid={p.testId} style={p.gap === 16 ? { gap: 16 } : undefined}>{p.children}</div>
}
