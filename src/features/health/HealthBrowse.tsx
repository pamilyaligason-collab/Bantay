import { Tile } from '../look/Tile'
import type { Hue } from '../look/cardParts'
import type { IconName } from '../shell/Icon'
import { nextVisitLine } from './visitsLogic'
import { useVisits } from './useVisits'
import './health.css'

export interface Door { key: string; hue: Hue; icon: IconName; label: string; sub: string; href: string }

/** The doors, in grid order. Two columns, so a hue is never the neighbour of itself (HealthBrowse.test). Papers moved to Family (D-100); Library and Videos to Discover. */
export function doors(visit: string | null): Door[] {
  return [
    { key: 'readings', hue: 'blue', icon: 'gauge', label: 'Readings', sub: 'BP, sugar, weight', href: '#health/readings' },
    { key: 'body', hue: 'green', icon: 'heart', label: 'Body wiki', sub: 'How parts work', href: '#health/body' },
    { key: 'move', hue: 'green', icon: 'move', label: 'Move & food', sub: 'Moves, meals and salt', href: '#health/move' },
    { key: 'visits', hue: 'blue', icon: 'calendar', label: 'Visits', sub: visit ?? 'What to bring', href: '#health/visits' }
  ]
}

/** "More in Health" (W-24): 2-column tiles, no Papers door. Refills sit on the Medicines screen, Food on the Move screen. */
export function HealthBrowse({ personId }: { personId: string }) {
  const visit = nextVisitLine(useVisits(personId))
  return (
    <section aria-labelledby="hb-h" data-testid="browse">
      <h2 className="hd" id="hb-h">More in Health</h2>
      <div className="gl-grid more">
        {doors(visit?.text ?? null).map((d) => <Tile key={d.key} testId={`browse-${d.key}`} hue={d.hue} icon={d.icon} label={d.label} value={d.sub} href={d.href} />)}
      </div>
    </section>
  )
}
