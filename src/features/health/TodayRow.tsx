import { useMemo } from 'react'
import { Section } from '../look'
import { Ring } from '../look/Ring'
import type { Hue } from '../look'
import { useGoal, useWater } from '../nutrition/hooks'
import { useTodayDoses } from './GlanceGrid'
import { HealthSpark } from './HealthSpark'
import { todayTiles, type TodayTile } from './todayLogic'
import type { Reading } from './ranges'
import { useActivity } from './useActivity'
import './health.css'

const CARD_HUE: Record<TodayTile['tint'], string> = { blue: 'blue', red: 'terra', amber: 'amber', teal: 'teal', purple: 'lilac', green: 'green' } // the card system's data-hue names; the tile's own data-tint rules stay as the fallback fill
const RING_HUE: Partial<Record<TodayTile['code'], Hue>> = { water: 'blue', steps: 'amber', meds: 'green' }

/** Today: six tinted stat tiles (BP, pulse, water, steps, sleep, medicines), two to a row on a phone. Each shows today's number, a small visual (a ring against today's goal, or a 7-day sparkline) and opens its page.
 *  A tile with no data today shows "--" and says so; nothing is drawn for it, never a zero. */
export function TodayRow({ personId, readings }: { personId: string; readings: Reading[] }) {
  const activity = useActivity(personId, 8)
  const water = useWater(personId, 8)
  const goal = useGoal(personId)
  const doses = useTodayDoses(personId)
  const tiles = useMemo(() => todayTiles({ personId, readings, activity, doses: doses?.doses ?? null, hasMeds: doses?.hasMeds, water, goalMl: goal.waterMl, goalSource: goal.waterSource, now: new Date() }), [personId, readings, activity, doses, water, goal.waterMl, goal.waterSource])
  return (
    <Section title="Today" testId="today-kpis">
      <div className="tk-grid" role="group" aria-label="Today">
        {tiles.map((t) => (
          <a key={t.code} className="card tap tint tk press" href={t.href} data-tint={t.tint} data-hue={CARD_HUE[t.tint]} data-empty={t.empty ? '' : undefined} data-testid={`tk-${t.code}`}>
            <span className="tk-l cd-kicker">{t.label}</span>
            <span className="tk-v cd-value">{t.value}</span>
            <span className="tk-s cd-meta">{t.sub}</span>
            <span className="tk-vis" data-testid={`tk-${t.code}-${t.ring != null ? 'ring' : 'spark'}`}>
              {t.ring != null ? <Ring value={t.ring} size={28} hue={RING_HUE[t.code] ?? 'green'} /> : <HealthSpark values={t.spark} />}
            </span>
          </a>
        ))}
      </div>
    </Section>
  )
}
