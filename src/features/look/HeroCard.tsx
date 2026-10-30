import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { CardActionButton, CardClose, type CardAction, type Hue } from './cardParts'
import './cards.css'

/** Flat tinted hero (C-1): icon + title are required, the whole card is the link when it has an `href`, one primary action. Dark theme draws no fill (cards.css). */
export function HeroCard(p: { hue: Hue; icon: IconName; kicker?: string; title: string; body?: ReactNode; href?: string; action?: CardAction; onClose?: () => void; closeLabel?: string; media?: ReactNode; testId?: string; children?: ReactNode }) {
  return (
    <section className="card hc" data-hue={p.hue} data-testid={p.testId}>
      <div className="hc-head">
        <span className="hc-ic"><Icon name={p.icon} size={24} /></span>
        <div className="hc-txt">
          {p.kicker && <span className="hc-kicker">{p.kicker}</span>}
          <h2 className="hc-title">{p.href ? <a className="hc-link" href={p.href}>{p.title}</a> : p.title}</h2>
        </div>
        {p.onClose && <CardClose onClose={p.onClose} label={p.closeLabel} />}
      </div>
      {p.body && <div className="hc-body">{p.body}</div>}
      {p.media && <div className="hc-media">{p.media}</div>}
      {p.children}
      {p.action && <CardActionButton action={p.action} />}
    </section>
  )
}
