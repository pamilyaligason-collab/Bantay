import type { ReactNode } from 'react'
import { JackArt, type JackName } from './JackArt'
import { CardActionButton, type CardAction } from './cardParts'
import './cards.css'

/** Scene hero (C-1, D-101): an animated scene under a contrast-gated scrim. At most one per tab; <= 240 px compact, <= 280 px expanded. The scene is aria-hidden, Jack sits in his own cell (D-103),
 *  `inkOnScene` = light text on the scene (the scrim is what keeps it 4.5:1). The whole card is the link when it has an `href`. */
export function SceneHero(p: { scene: ReactNode; scrim?: boolean; inkOnScene?: boolean; kicker?: string; title: ReactNode; body?: ReactNode; href?: string; action?: CardAction; secondary?: CardAction; jack?: JackName; jackSize?: 56 | 96 | 112; compact?: boolean; testId?: string; children?: ReactNode }) {
  return (
    <section className="card sc" data-compact={p.compact || undefined} data-ink={p.inkOnScene ? 'light' : undefined} data-jack={p.jack ? '' : undefined} data-testid={p.testId}>
      <div className="sc-scene" aria-hidden="true">{p.scene}</div>
      {p.scrim && <div className="sc-scrim" aria-hidden="true" />}
      <div className="sc-body">
        <div className="sc-txt">
          {p.kicker && <span className="sc-kicker">{p.kicker}</span>}
          <h2 className="sc-title">{p.href ? <a className="hc-link" href={p.href}>{p.title}</a> : p.title}</h2>
          {p.body && <div className="sc-copy">{p.body}</div>}
        </div>
        {p.jack && <div className="sc-jack"><JackArt name={p.jack} size={p.jackSize ?? 96} /></div>}
      </div>
      {p.children}
      {(p.action || p.secondary) && (
        <div className="sc-acts">
          {p.action && <CardActionButton action={p.action} />}
          {p.secondary && <CardActionButton action={p.secondary} secondary />}
        </div>
      )}
    </section>
  )
}
