import { Icon, type IconName } from '../shell/Icon'

/** A blank list says what goes here and what to do next, instead of rendering nothing. */
export function EmptyState({ icon, title, body, action, heading }: { icon?: IconName; title: string; body?: string; action?: { label: string; onClick: () => void }; heading?: 'h2' | 'h3' }) {
  const Title = heading ?? 'p' // a heading only where the empty card stands in for a section that had one
  return (
    <div className="card empty-state">
      {icon && <Icon name={icon} size={26} boxed />}
      <Title className="hd">{title}</Title>
      {body && <p className="sub">{body}</p>}
      {action && <button type="button" className="btn2" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}
