import { useId, type ReactNode } from 'react'
import './v13.css'

/** A titled block (contract 4). `link` draws a 44 px text link or button on the right; `meta` draws plain muted text instead. */
export function Section(p: { title: string; link?: { href: string; label: string } | { onClick: () => void; label: string }; meta?: string; children: ReactNode; testId?: string; id?: string }) {
  const h = useId()
  return (
    <section className="sec" aria-labelledby={h} data-testid={p.testId} id={p.id}>
      <div className="sec-h">
        <h2 id={h}>{p.title}</h2>
        {p.link ? ('href' in p.link ? <a href={p.link.href}>{p.link.label}</a> : <button type="button" onClick={p.link.onClick}>{p.link.label}</button>)
          : p.meta && <span className="sec-meta">{p.meta}</span>}
      </div>
      {p.children}
    </section>
  )
}
