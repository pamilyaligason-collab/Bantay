import { Icon, type IconName } from '../shell/Icon'
import { JackArt, type JackName } from './JackArt'

/** A blank list says what goes here and what to do next, instead of rendering nothing. `jack` picks his pose; `icon` wins when both are passed (contract); with neither he holds an empty checklist (D-91: never on SOS, emergency or diagnosis screens). */
export function EmptyState({ icon, jack, title, body, action, heading }: { icon?: IconName; jack?: JackName; title: string; body?: string; action?: { label: string; onClick: () => void }; heading?: 'h2' | 'h3' }) {
  const Title = heading ?? 'p' // a heading only where the empty card stands in for a section that had one
  return (
    <div className="card empty-state">
      {icon ? <Icon name={icon} boxed /> : jack ? <JackArt name={jack} size={96} decorative /> : <JackArt name="empty-list" size={96} />}
      <Title className="hd">{title}</Title>
      {body && <p className="sub">{body}</p>}
      {action && <button type="button" className="btn2" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}
