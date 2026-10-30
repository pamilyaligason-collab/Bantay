import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { CardActionButton, CardClose, type CardAction } from './cardParts'
import './cards.css'

/** Alert card (C-1): full width, red or amber, 32 px icon + title + <= 3 lines + one action + close where N-10 applies. Never carries Jack (D-91). */
export function AlertCard(p: { tone: 'red' | 'amber'; icon: IconName; title: string; body?: ReactNode; action?: CardAction; onClose?: () => void; closeLabel?: string; testId?: string }) {
  return (
    <section className="card ac" data-tone={p.tone} data-testid={p.testId}>
      <div className="ac-head">
        <span className="ac-ic"><Icon name={p.icon} size={32} /></span>
        <h2 className="ac-title">{p.title}</h2>
        {p.onClose && <CardClose onClose={p.onClose} label={p.closeLabel} />}
      </div>
      {p.body && <div className="ac-body">{p.body}</div>}
      {p.action && <CardActionButton action={p.action} />}
    </section>
  )
}
