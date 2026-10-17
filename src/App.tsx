import { useEffect, useState } from 'react'
import Family from './screens/Family'
import Health from './screens/Health'
import Records from './screens/Records'
import Safety from './screens/Safety'
import Today from './screens/Today'

// Tab icons and order copied from the prototype tab bar.
const SHIELD = 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'
const TABS = [
  { id: 'today', label: 'Today', Screen: Today, icon: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'health', label: 'Health', Screen: Health, icon: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z' },
  { id: 'records', label: 'Records', Screen: Records, icon: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6' },
  { id: 'family', label: 'Family', Screen: Family, icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M16 15c3 0 5 2 5 5' },
  { id: 'safety', label: 'Safety', Screen: Safety, icon: SHIELD }
] as const

const fromHash = () => TABS.find((t) => t.id === location.hash.slice(1)) ?? TABS[0]

export default function App() {
  const [tab, setTab] = useState(fromHash)
  useEffect(() => {
    const on = () => setTab(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return (
    <div className="bt">
      <div className="topbar" />
      <main className="scroll">
        <tab.Screen />
      </main>
      <nav aria-label="Main" className="glass tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-current={t.id === tab.id ? 'page' : 'false'} onClick={() => { location.hash = t.id }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
