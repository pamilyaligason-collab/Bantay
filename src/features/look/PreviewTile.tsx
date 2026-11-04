import type { ReactNode } from 'react'
import type { Tint } from './Row'
import './v13.css'

/** 2-column tile (contract 4): kicker, big value, sub line and a 44 px action label at the bottom. The whole tile is the link. */
export function PreviewTile(p: { kicker?: string; tint: Tint; value: string; sub?: string; action?: string; href: string; valueSize?: 'lg' | 'md'; media?: ReactNode; testId?: string }) {
  return (
    <a className="card pt press" href={p.href} data-tint={p.tint} data-size={p.valueSize ?? 'lg'} data-testid={p.testId}>
      {p.kicker && <span className="pt-k">{p.kicker}</span>}
      {p.media}
      <span className="pt-v">{p.value}</span>
      {p.sub && <span className="pt-s">{p.sub}</span>}
      {p.action && <span className="pt-a">{p.action}</span>}
    </a>
  )
}
