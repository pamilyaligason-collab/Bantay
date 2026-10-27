import { Icon, type IconName } from '../shell/Icon'

/** A blank list says what goes here and what to do next, instead of rendering nothing. */
export function EmptyState({ icon, title, body, action }: { icon?: IconName; title: string; body?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="card empty-state">
      {icon && <Icon name={icon} size={26} boxed />}
      <p className="hd">{title}</p>
      {body && <p className="sub">{body}</p>}
      {action && <button type="button" className="btn2" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}
