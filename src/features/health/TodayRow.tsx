import { useMemo } from 'react'
import { Section } from '../look'
import { useGoal, useWater } from '../nutrition/hooks'
import { useTodayDoses } from './GlanceGrid'
import { todayTiles } from './todayLogic'
import type { Reading } from './ranges'
import { useActivity } from './useActivity'
import './health.css'

/** Today: six small tinted stat tiles (BP, pulse, water, steps, sleep, medicines). A tile with no data today shows "--" and says so; each opens its page. */
export function TodayRow({ personId, readings }: { personId: string; readings: Reading[] }) {
  const activity = useActivity(personId, 3)
  const water = useWater(personId)
  const goal = useGoal(personId)
  const doses = useTodayDoses(personId)
  const tiles = useMemo(() => todayTiles({ personId, readings, activity, doses: doses?.doses ?? null, hasMeds: doses?.hasMeds, water, goalMl: goal.waterMl, goalSource: goal.waterSource, now: new Date() }), [personId, readings, activity, doses, water, goal.waterMl, goal.waterSource])
  return (
    <Section title="Today" testId="today-kpis">
      <div className="tk-grid" role="group" aria-label="Today">
        {tiles.map((t) => (
          <a key={t.code} className="tk press" href={t.href} data-tint={t.tint} data-empty={t.empty ? '' : undefined} data-testid={`tk-${t.code}`}>
            <span className="tk-l">{t.label}</span>
            <span className="tk-v">{t.value}</span>
            <span className="tk-s">{t.sub}</span>
          </a>
        ))}
      </div>
    </Section>
  )
}
