import type { CSSProperties } from 'react'

/** Placeholder blocks while a tab loads. Hidden from screen readers; the caller keeps one visible "Loading" label (aria-busy on its section). */
export function Skeleton({ lines = 3, card = true, style }: { lines?: number; card?: boolean; style?: CSSProperties }) {
  return (
    <div className={card ? 'card skel' : 'skel'} aria-hidden="true" style={style}>
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skel-line" style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }} />)}
    </div>
  )
}
