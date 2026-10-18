import { Fragment } from 'react'
import { ASK_EVENT } from '../assistant/Assistant'
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
  return (
    <nav aria-label="Main" className="tabbar sh sh-tabs">
      {ITEMS.map((t, i) => (
        <Fragment key={t.id}>
          {i === 2 && (
            <button type="button" className="sh-ask" aria-label="Ask Bantay" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}>
              <span className="sh-bub"><Icon name="chat" size={26} /></span>
              <span aria-hidden="true">Ask</span>
            </button>
          )}
          <button type="button" aria-current={t.id === active ? 'page' : 'false'} onClick={() => { location.hash = t.id }}>
            <Icon name={t.icon} />
            {t.label}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}
