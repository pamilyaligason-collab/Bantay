import type { ReactNode } from 'react'
import './v13.css'

/** 2 to 4 options, 44 px, radius 12, card-coloured thumb (contract 4). Options with an href are links (aria-current), the rest buttons (aria-pressed). */
export function Segmented<T extends string>(p: { options: { id: T; label: string; href?: string }[]; value: T; onChange?: (id: T) => void; label: string; testId?: string; trailing?: ReactNode }) {
  return (
    <div className="segd" role="group" aria-label={p.label} data-testid={p.testId}>
      {p.options.map((o) => o.href
        ? <a key={o.id} href={o.href} aria-current={o.id === p.value ? 'page' : undefined} onClick={() => p.onChange?.(o.id)}>{o.label}</a>
        : <button key={o.id} type="button" aria-pressed={o.id === p.value} onClick={() => p.onChange?.(o.id)}>{o.label}</button>)}
      {p.trailing}
    </div>
  )
}
