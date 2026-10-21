import type { ReactNode } from 'react'
import { Icon } from './Icon'
import './shell.css'

/** Sub-page header: back button, title, optional trailing pill, always on one row. A long title (over 18 characters, e.g. a metric name) steps down to 22px and may take two lines instead of an ellipsis. `className` adds page scoped classes (Safety uses it for the place chip). */
export function SubHeader({ title, backHref, backLabel = 'Back', trailing, className = '' }: { title: string; backHref: string; backLabel?: string; trailing?: ReactNode; className?: string }) {
  return (
    <div className={`hdr sh-subhdr ${className}`.trim()} data-long={title.length > 18 || undefined}>
      <a className="sh-iconbtn sh-back" href={backHref} aria-label={backLabel}><Icon name="back" /></a>
      <h1>{title}</h1>
      {trailing}
    </div>
  )
}
