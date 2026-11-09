import { useState } from 'react'
import { LargeTitle } from '../../look'
import { Ring } from '../../look/Ring'
import { Segmented } from '../../look/Segmented'
import { useGoal, useWater } from '../../nutrition/hooks'
import { goalGlasses } from '../../nutrition/waterGoal'
import { MetricChart } from '../MetricChart'
import { WhoLine } from '../WhoLine'
import { inPeriod, type Period, type Point } from '../model'
import { dailyCount, WATER_TIP, waterSummary } from '../trendLogic'
import { useHealthPerson } from '../useHealthPerson'
import { dayOf } from '../meds'
import { useNow } from './useNow'
import './detail.css'

/** One point per local day that has a glass logged (a day with none has no point, never 0). */
export function waterPoints(stamps: string[]): Point[] {
  const by = new Map<string, number>()
  for (const s of stamps) { const d = dayOf(s); if (d) by.set(d, (by.get(d) ?? 0) + 1) }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => ({ takenAt: `${d}T12:00:00.000Z`, value: n }))
}

/** #health/metric/water: the Water tile's page. Same hero pattern as Sleep and Steps: today against the goal, the average, a 7 or 30 day chart and one general tip. Logging stays in Nutrition. */
export function WaterDetail() {
  const { ready, personId } = useHealthPerson()
  const now = useNow()
  const [period, setPeriod] = useState<Period>('week')
  const water = useWater(personId, 31)
  const goal = useGoal(personId)
  const goalGl = goal.waterMl == null ? null : goalGlasses(goal.waterMl, goal.waterSource)
  const stamps = water.filter((w) => w.personId === personId).map((w) => w.drunkAt)
  const pts = waterPoints(stamps)
  const shown = inPeriod(pts, period, now)
  const today = dailyCount(stamps, now, 1)[0] ?? null
  const summary = waterSummary(dailyCount(stamps, now, 7), goalGl)
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Water" />
      <WhoLine />
      {!ready ? null : goalGl == null ? (
        <div className="grp sd-hero"><div className="row"><span className="grow">No water goal for this age<span className="sub">Bantay does not set a water goal for a baby under 1 year.</span></span></div></div>
      ) : (
        <>
          <div className="card tint sd-hero" data-hue="blue" data-testid="water-hero">
            <div className="row sd-col">
              <span className="sub cd-kicker">Today</span>
              <span className="sd-ringrow">
                {today != null && <Ring value={Math.min(1, today / goalGl)} size={40} hue="blue" />}
                <strong className="hv-big cd-value">{today == null ? '--' : `${today}/${goalGl}`}</strong>
              </span>
              <span className="sub cd-meta">{today == null ? 'Nothing logged today yet.' : today === 1 ? 'glass today' : 'glasses today'}</span>
              {summary && <p className="sd-line" data-testid="water-summary">{summary}</p>}
            </div>
          </div>
          <a className="btn mc-add" href="#health/nutrition">Log water in Nutrition</a>
          {pts.length > 0 && (
            <>
              <Segmented<Period> label="Period" value={period} onChange={setPeriod} options={[{ id: 'week', label: 'This week' }, { id: 'month', label: '30 days' }]} />
              <div className="grp hv-graph">
                {shown.length === 0
                  ? <p className="sub" style={{ margin: 0, padding: 16 }}>Nothing in the last {period === 'week' ? '7' : '30'} days. Newer glasses will show here.</p>
                  : <MetricChart pts={shown} days={period === 'week' ? 7 : 30} now={now} label={`Water ${period === 'week' ? 'this week' : 'this month'}`} unit="glasses" goal={goalGl} />}
              </div>
              <div className="grp hv-advice" style={{ marginTop: 16 }} data-testid="water-tip">
                <div className="row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                  <strong className="cd-title">General tips</strong>
                  <span>{WATER_TIP}</span>
                  <span className="sub">General information, not medical advice. Your doctor sets your own target.</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
