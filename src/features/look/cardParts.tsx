import { useId } from 'react'
import { Icon } from '../shell/Icon'

/** Section tint (C-2). 'none' draws a plain card. */
export type Hue = 'blue' | 'green' | 'lilac' | 'amber' | 'terra' | 'none'
export interface CardAction { label: string; href?: string; onClick?: () => void; disabled?: boolean; lockReason?: string }

/** The one action of a card (C-1): a link when it has an href, otherwise a button. `disabled` + `lockReason` draws the lock and "View only" with the reason in plain text (D-99). */
export function CardActionButton({ action, secondary = false }: { action: CardAction; secondary?: boolean }) {
  const cls = `${secondary ? 'btn2' : 'btn'} cd-act`
  const reasonId = useId()
  if (action.disabled) {
    return (
      <>
        <button type="button" className={cls} disabled aria-label={`${action.label}, view only`} aria-describedby={action.lockReason ? reasonId : undefined}>
          {action.lockReason ? <><Icon name="lock" size={20} /><span>View only</span></> : <span>{action.label}</span>}
        </button>
        {action.lockReason && <span id={reasonId} className="sub cd-reason">{action.lockReason}</span>}
      </>
    )
  }
  if (action.href) return <a className={cls} href={action.href} onClick={action.onClick}><span>{action.label}</span></a>
  return <button type="button" className={cls} onClick={action.onClick}><span>{action.label}</span></button>
}

/** 48 px close button (C-1). */
export function CardClose({ onClose, label = 'Close' }: { onClose: () => void; label?: string }) {
  return <button type="button" className="cd-close" aria-label={label} onClick={onClose}><Icon name="close" size={20} /></button>
}
