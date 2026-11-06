import type { KeyboardEvent } from 'react'

export type View = 'today' | 'news' | 'saved'
export const VIEWS: { id: View; label: string }[] = [{ id: 'today', label: 'Today' }, { id: 'news', label: 'News' }, { id: 'saved', label: 'Saved' }]
export const tabId = (v: View) => `dc-tab-${v}`
export const panelId = (v: View) => `dc-panel-${v}`

/** Today | News | Saved. A tablist with roving focus: arrows move and select, Home and End jump (WAI-ARIA tabs, automatic activation). */
export function DiscoverTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === 'ArrowRight' ? (i + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (i + VIEWS.length - 1) % VIEWS.length : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    onChange(VIEWS[to]!.id)
    document.getElementById(tabId(VIEWS[to]!.id))?.focus()
  }
  return (
    <div className="dc-seg" role="tablist" aria-label="Discover views" data-testid="dc-tabs">
      {VIEWS.map((v, i) => (
        <button key={v.id} id={tabId(v.id)} type="button" role="tab" aria-selected={v.id === view} aria-controls={panelId(v.id)} tabIndex={v.id === view ? 0 : -1} onClick={() => onChange(v.id)} onKeyDown={(e) => move(e, i)}>{v.label}</button>
      ))}
    </div>
  )
}
