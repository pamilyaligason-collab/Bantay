import type { CSSProperties } from 'react'
import { useUnseenAlerts } from '../notify/useAlerts'
import '../notify/notify.css'
import { Icon, type IconName } from './Icon'
import { TABS, type Tab } from './routes'
import './shell.css'

// Glyphs follow board Main: house, heart with a pulse, compass, people, plain shield (the last three are drawn in icons/custom.tsx).
const ITEMS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'health', label: 'Health', icon: 'tabHeart' },
  { id: 'discover', label: 'Discover', icon: 'tabCompass' },
  { id: 'family', label: 'Family', icon: 'users' },
  { id: 'safety', label: 'Safety', icon: 'tabShield' }
]

/** Five equal slots, mockup round 2: Today, Health, Discover, Family, Safety. Ask is the floating Jack button (JackFab), not a tab. */
export function TabBar({ active }: { active: Tab | null }) {
  const unseen = useUnseenAlerts() // family alerts not yet seen: badge on Family (D-78)
  const at = active ? TABS.indexOf(active) : -1
  const pill = { '--slot': Math.max(at, 0), '--pill': at < 0 ? 0 : 1 } as CSSProperties
  return (
    <nav aria-label="Main" className="tabbar sh sh-tabs" data-testid="tabbar" data-active={active ?? 'none'} style={pill}>
      {ITEMS.map((t) => {
        const alerts = t.id === 'family' && unseen > 0 ? `${unseen} new alert${unseen === 1 ? '' : 's'}` : ''
        return (
        <button key={t.id} type="button" data-testid={`tab-${t.id}`} aria-label={alerts ? `${t.label}, ${alerts}` : t.label} aria-current={t.id === active ? 'page' : 'false'} onClick={() => { location.hash = t.id }}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
          {alerts && <span className="sh-tabbadge" role="img" aria-label={alerts} />}
        </button>
        )
      })}
    </nav>
  )
}
