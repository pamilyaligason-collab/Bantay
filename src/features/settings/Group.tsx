import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import '../shell/shell.css'
import './settings.css'

/** A Settings group page: its own Back (to #me) and title, one screen of rows. */
export default function Group({ title, children, testId, backHref = '#me', backLabel = 'Back to Settings' }: { title: string; children: ReactNode; testId?: string; backHref?: string; backLabel?: string }) {
  return (
    <div className="sh sh-me st-group" data-testid={testId}>
      <SubHeader title={title} backHref={backHref} backLabel={backLabel} />
      {children}
    </div>
  )
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="sh-switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

/** "View only" mark for a row that writes for a person while acting (W-28). */
export function Lock() {
  return <span className="st-lock"><Icon name="lock" size={16} />View only</span>
}

type RowProps = { icon: IconName; title: string; sub?: string; testId?: string; locked?: boolean }
const Text = ({ title, sub }: { title: string; sub?: string }) => <span className="sh-grow"><b>{title}</b>{sub && <span className="sh-sub sh-blk">{sub}</span>}</span>

/** One 64 px row: 40 px chip with a 20 px icon, title, one-line value, chevron. A link, a button, or (locked) a plain row with the lock mark. */
export function NavRow({ icon, title, sub, href, onClick, popup, locked, testId }: RowProps & { href?: string; onClick?: () => void; popup?: boolean }) {
  const inner = <><Icon name={icon} boxed size={20} /><Text title={title} sub={sub} /></>
  if (locked) return <div className="sh-navrow st-row" aria-disabled="true" data-testid={testId}>{inner}<Lock /></div>
  if (href) return <a className="sh-navrow st-row" href={href} data-testid={testId}>{inner}<Icon name="chev" size={20} /></a>
  return <button type="button" className="sh-navrow st-row" onClick={onClick} aria-haspopup={popup ? 'dialog' : undefined} data-testid={testId}>{inner}<Icon name="chev" size={20} /></button>
}

export function SwitchRow({ icon, title, sub, on, onChange }: RowProps & { on: boolean; onChange: (v: boolean) => void }) {
  return <div className="st-row"><Icon name={icon} boxed size={20} /><Text title={title} sub={sub} /><Switch label={title} on={on} onChange={onChange} /></div>
}
