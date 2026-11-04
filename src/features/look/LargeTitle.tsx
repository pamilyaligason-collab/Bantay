import type { ReactNode } from 'react'
import { Icon } from '../shell/Icon'
import './v13.css'

/** Page head (contract 4): kicker + 34 px h1 + right-side actions. A pushed page passes `back` and draws a Back link with the parent name in place of the kicker. */
export function LargeTitle(p: { title: string; kicker?: string; back?: { href: string; label: string }; actions?: ReactNode; below?: ReactNode; testId?: string; tone?: 'red' | 'purple' | 'teal' }) {
  return (
    <header className="lt" data-testid={p.testId}>
      <div className="lt-row">
        {p.back
          ? <a className="lt-back" data-tone={p.tone} href={p.back.href} aria-label={p.back.label === 'Back' ? p.back.label : `Back to ${p.back.label}`}><Icon name="back" size={22} /><span>{p.back.label}</span></a>
          : <span className="lt-kicker">{p.kicker}</span>}
        {p.actions && <div className="lt-actions">{p.actions}</div>}
      </div>
      {p.below
        ? <div className="lt-trow"><h1 className="lt-title">{p.title}</h1><div className="lt-below">{p.below}</div></div>
        : <h1 className="lt-title">{p.title}</h1>}
    </header>
  )
}
