import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import './cards.css'

/** Row (C-1): 40 px leading icon or avatar, title, one sub line, then a chevron (link) or one control. A control sits beside the main part, never inside the link. */
export function Row(p: { icon?: IconName; avatar?: ReactNode; title: string; sub?: string; href?: string; onClick?: () => void; control?: ReactNode; badge?: number; testId?: string }) {
  const main: ReactNode = (
    <>
      <span className="rw-lead">{p.avatar ?? (p.icon && <Icon name={p.icon} size={20} />)}</span>
      <span className="rw-txt"><b className="rw-title">{p.title}</b>{p.sub && <span className="rw-sub">{p.sub}</span>}</span>
      {p.badge !== undefined && p.badge > 0 && <span className="rw-badge">{p.badge}</span>}
      {p.href && <Icon name="chev" size={20} />}
    </>
  )
  return (
    <div className="rw" data-testid={p.testId}>
      {p.href ? <a className="rw-main press" href={p.href} onClick={p.onClick}>{main}</a>
        : p.onClick ? <button type="button" className="rw-main press" onClick={p.onClick}>{main}</button>
        : <div className="rw-main">{main}</div>}
      {p.control}
    </div>
  )
}
