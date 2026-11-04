import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import '../look/cards.css'
import '../look/v13.css'
import type { Tint } from '../look/Row'
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

type RowProps = { icon: IconName; tint?: Tint; title: string; sub?: string; testId?: string; locked?: boolean }
/** The board's 32 px tinted icon chip (Settings board), the same chip look/Row draws. */
const Chip = ({ icon, tint = 'green' }: { icon: IconName; tint?: Tint }) => <span className="rw-ic" data-tint={tint}><Icon name={icon} size={18} /></span>
const Text = ({ title, sub }: { title: string; sub?: string }) => <span className="sh-grow"><b>{title}</b>{sub && <span className="sh-sub sh-blk">{sub}</span>}</span>

/** One 56 px row: 32 px tint chip with an 18 px icon, title, one-line value, chevron. A link, a button, or (locked) a plain row with the lock mark. */
export function NavRow({ icon, tint, title, sub, href, onClick, popup, locked, testId }: RowProps & { href?: string; onClick?: () => void; popup?: boolean }) {
  const inner = <><Chip icon={icon} tint={tint} /><Text title={title} sub={sub} /></>
  if (locked) return <div className="sh-navrow st-row" aria-disabled="true" data-testid={testId}>{inner}<Lock /></div>
  if (href) return <a className="sh-navrow st-row" href={href} data-testid={testId}>{inner}<Icon name="chev" size={16} /></a>
  return <button type="button" className="sh-navrow st-row" onClick={onClick} aria-haspopup={popup ? 'dialog' : undefined} data-testid={testId}>{inner}<Icon name="chev" size={16} /></button>
}

export function SwitchRow({ icon, tint, title, sub, on, onChange }: RowProps & { on: boolean; onChange: (v: boolean) => void }) {
  return <div className="st-row"><Chip icon={icon} tint={tint} /><Text title={title} sub={sub} /><Switch label={title} on={on} onChange={onChange} /></div>
}

/** A setting that is not built yet: shown dim with a "Later" pill, no control (the Settings board marks these Later). */
export function LaterRow({ icon, tint, title, sub }: { icon: IconName; tint?: Tint; title: string; sub: string }) {
  return <div className="st-row st-later" aria-disabled="true"><Chip icon={icon} tint={tint} /><span className="sh-grow"><b>{title} <span className="st-pill">Later</span></b><span className="sh-sub sh-blk">{sub}</span></span></div>
}
