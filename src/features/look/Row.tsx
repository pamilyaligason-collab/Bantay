import { createContext, useContext, type ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import './cards.css'
import './v13.css'

/** GroupedList sets this so a Row is a list item only inside a list (a lone Row elsewhere must not claim a role without its parent). */
export const InList = createContext(false)
export type Tint = 'blue' | 'red' | 'amber' | 'teal' | 'purple' | 'green' | 'none'

/** Row (contract 4): 32 px leading icon box (tint fill + tint ink) or avatar, title, one sub line, optional value and badge, then a chevron (link) or one control. A control sits beside the main part, never inside the link. */
export function Row(p: { icon?: IconName; tint?: Tint; avatar?: ReactNode; chev?: boolean; title: string; sub?: string; value?: string; badge?: string | number; badgeTint?: Tint; href?: string; onClick?: () => void; control?: ReactNode; testId?: string }) {
  const inList = useContext(InList)
  const badge = p.badge !== undefined && p.badge !== 0 && p.badge !== ''
  const main: ReactNode = (
    <>
      <span className="rw-lead rw-ic" data-tint={p.tint ?? 'none'}>{p.avatar ?? (p.icon && <Icon name={p.icon} size={20} />)}</span>
      <span className="rw-txt"><b className="rw-title">{p.title}</b>{p.sub && <span className="rw-sub">{p.sub}</span>}</span>
      {p.value && <span className="rw-value">{p.value}</span>}
      {badge && <span className="rw-badge" data-tint={p.badgeTint ?? (typeof p.badge === 'number' ? 'red-solid' : 'none')}>{p.badge}</span>}
      {(p.href || p.chev) && !p.control && <Icon name="chev" size={20} />}
    </>
  )
  return (
    <div className="rw" role={inList ? 'listitem' : undefined} data-testid={p.testId}>
      {p.href ? <a className="rw-main press" href={p.href} onClick={p.onClick}>{main}</a>
        : p.onClick ? <button type="button" className="rw-main press" onClick={p.onClick}>{main}</button>
        : <div className="rw-main">{main}</div>}
      {p.control}
    </div>
  )
}
