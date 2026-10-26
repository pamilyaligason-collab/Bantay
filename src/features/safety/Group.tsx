import type { ReactNode } from 'react'

export type GroupTone = 'emergency' | 'aid' | 'alerts' | 'hotlines' | 'ready'

/** A labelled Safety section on a subtle tinted panel (tone tokens in safety.css). The title is the section's accessible name. */
export function Group({ id, tone, title, sub, children }: { id: string; tone: GroupTone; title: string; sub?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`sf-grp sf-grp-${tone}`}>
      <header className="sf-grp-h">
        <h2 id={id}>{title}</h2>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </section>
  )
}
