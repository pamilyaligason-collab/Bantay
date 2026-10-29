import { Icon } from '../shell/Icon'

/** The entry tile on Health (one hook line in Health.tsx): opens #health/nudge. Same look as the other Health tiles. */
export function NudgeEntry() {
  return (
    <a className="card hv-explore" href="#health/nudge" data-testid="nudge-entry">
      <Icon name="flame" tone="vitals" boxed />
      <span className="grow">My progress<small>Week, pillbox and family hearts</small></span>
      <Icon name="chev" size={20} />
    </a>
  )
}
