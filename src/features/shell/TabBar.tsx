import { Fragment, useCallback, useEffect, useState, type CSSProperties } from 'react'
import { AskSheet } from './AskSheet'
import { useUnseenAlerts } from '../notify/useAlerts'
import '../notify/notify.css'
import { useKv } from './useKv'
import { Icon, type IconName } from './Icon'
import type { Tab } from './routes'
import './shell.css'

const ITEMS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'health', label: 'Health', icon: 'heart' },
  { id: 'family', label: 'Family', icon: 'users' },
  { id: 'safety', label: 'Safety', icon: 'shield' }
]

/** Five slots, mockup order: Today, Health, raised Ask, Family, Safety. Ask opens the assistant until it becomes a tab (P6). */
export function TabBar({ active }: { active: Tab | null }) {
  const [sheet, setSheet] = useState(false)
  const unseen = useUnseenAlerts() // family alerts not yet seen: badge on Family (D-78)
  const [seen, setSeen, loaded] = useKv('askHintSeen', false)
  const open = () => { setSheet(true); if (!seen) setSeen(true) }
  const onClose = useCallback(() => { if (history.state?.bantayAsk) history.back(); else setSheet(false) }, [])
  const onDone = useCallback(() => setSheet(false), [])
  const [simple, , simpleLoaded] = useKv('mode.simple', false) // Simple mode hides the tab bar, so the hint is never seen there and must not count as seen
  const hint = loaded && simpleLoaded && !simple && !seen && !sheet && active === 'today'
  useEffect(() => { // the coach mark shows once: it counts as seen after 8 seconds, so it never sits on the page again
    if (!hint) return
    const t = setTimeout(() => setSeen(true), 8000)
    return () => clearTimeout(t)
  }, [hint, setSeen])
  const at = ITEMS.findIndex((t) => t.id === active)
  const pill = { '--slot': at < 2 ? at : at + 1, '--pill': at < 0 ? 0 : 1 } as CSSProperties // skip the Ask slot
  return (
    <nav aria-label="Main" className="tabbar sh sh-tabs" style={pill}>
      {ITEMS.map((t, i) => (
        <Fragment key={t.id}>
          {i === 2 && (
            <button type="button" className="sh-ask" aria-label="Ask Bantay" aria-haspopup="dialog" onClick={open}>
              <span className="sh-bub"><Icon name="chat" size={26} /><span className="sh-cam" aria-hidden="true"><Icon name="camera" size={12} /></span></span>
              <span aria-hidden="true">Ask</span>
            </button>
          )}
          <button type="button" aria-current={t.id === active ? 'page' : 'false'} onClick={() => { location.hash = t.id }}>
            <Icon name={t.icon} />
            {t.label}
            {t.id === 'family' && unseen > 0 && <span className="sh-tabbadge" role="img" aria-label={`${unseen} new alert${unseen === 1 ? '' : 's'}`} />}
          </button>
        </Fragment>
      ))}
      {hint && <p className="sh-hint" role="status">Scan papers here too</p>}
      {sheet && <AskSheet onClose={onClose} onDone={onDone} />}
    </nav>
  )
}
