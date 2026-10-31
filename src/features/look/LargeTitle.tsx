import type { ReactNode } from 'react'
import { Icon } from '../shell/Icon'
import './v13.css'

/** Page head (contract 4): kicker + 34 px h1 + right-side actions. A pushed page passes `back` and draws a Back link with the parent name in place of the kicker. */
export function LargeTitle(p: { title: string; kicker?: string; back?: { href: string; label: string }; actions?: ReactNode; testId?: string }) {
  return (
    <header className="lt" data-testid={p.testId}>
      <div className="lt-row">
        {p.back
          ? <a className="lt-back" href={p.back.href} aria-label={`Back to ${p.back.label}`}><Icon name="back" size={22} /><span>{p.back.label}</span></a>
          : <span className="lt-kicker">{p.kicker}</span>}
        {p.actions && <div className="lt-actions">{p.actions}</div>}
      </div>
      <h1 className="lt-title">{p.title}</h1>
    </header>
  )
}
