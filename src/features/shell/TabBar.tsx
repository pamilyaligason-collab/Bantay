import type { CSSProperties } from 'react'
import { useUnseenAlerts } from '../notify/useAlerts'
import '../notify/notify.css'
import { Icon, type IconName } from './Icon'
import { TABS, type Tab } from './routes'
import './shell.css'

// Discover uses `search` until a book glyph is added to Icon.tsx (Icon.tsx is not an F1 file; see the lane report).
const ITEMS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'health', label: 'Health', icon: 'heart' },
  { id: 'discover', label: 'Discover', icon: 'search' },
  { id: 'family', label: 'Family', icon: 'users' },
  { id: 'safety', label: 'Safety', icon: 'shield' }
]

/** Five equal slots, mockup round 2: Today, Health, Discover, Family, Safety. Ask is the floating Jack button (JackFab), not a tab. */
export function TabBar({ active }: { active: Tab | null }) {
  const unseen = useUnseenAlerts() // family alerts not yet seen: badge on Family (D-78)
  const at = active ? TABS.indexOf(active) : -1
  const pill = { '--slot': Math.max(at, 0), '--pill': at < 0 ? 0 : 1 } as CSSProperties
  return (
    <nav aria-label="Main" className="tabbar sh sh-tabs" style={pill}>
      {ITEMS.map((t) => (
        <button key={t.id} type="button" aria-current={t.id === active ? 'page' : 'false'} onClick={() => { location.hash = t.id }}>
          <Icon name={t.icon} />
          {t.label}
          {t.id === 'family' && unseen > 0 && <span className="sh-tabbadge" role="img" aria-label={`${unseen} new alert${unseen === 1 ? '' : 's'}`} />}
        </button>
      ))}
    </nav>
  )
}
