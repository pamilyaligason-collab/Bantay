import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import type { Tint } from './Row'
import './cards.css'
import './v13.css'

/** 2-column tile (contract 4): kicker, big value, sub line and a 44 px action label at the bottom. The whole tile is the link.
 *  `due` adds a still Due pill (and `icon`) to the kicker; `move` lets the ring and icon animate once (D-125, styles in nudge/nudgeDue.css). */
export function PreviewTile(p: { kicker?: string; tint: Tint; value: string; sub?: string; action?: string; href: string; valueSize?: 'lg' | 'md'; media?: ReactNode; testId?: string; due?: boolean; move?: boolean; icon?: IconName }) {
  return (
    <a className="card pt press" href={p.href} data-tint={p.tint} data-size={p.valueSize ?? 'lg'} data-testid={p.testId} data-nudge={p.due && p.move ? 'move' : undefined}>
      {p.kicker && <span className={p.due ? 'pt-k nd-k' : 'pt-k'}>{p.due && p.icon && <span className="nd-ic"><Icon name={p.icon} size={16} /></span>}{p.kicker}{p.due && <span className="nd-due">Due</span>}</span>}
      {p.media}
      <span className="pt-v">{p.value}</span>
      {p.sub && <span className="pt-s">{p.sub}</span>}
      {p.action && <span className="pt-a">{p.action}</span>}
    </a>
  )
}
