import { useMemo, useState } from 'react'
import { useFood, useGoal, useWater } from './hooks'
import { dailyTotals, fmt, onDay } from './logic'
import { SaltSummary } from './SaltSummary'
import PlateSheet from './PlateSheet'
import WaterPanel from './WaterPanel'
import { Icon } from '../shell/Icon'
import '../health/comply.css'

/** The last 7 days of sodium as bars against the limit (board "Salt, last 7 days"), from the person's own logged meals. A day with nothing logged is a stub, never a measured zero. */
function SaltWeek({ personId, goalMg }: { personId: string; goalMg: number }) {
  const food = useFood(personId, 8)
  const now = useMemo(() => new Date(), [])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i))
    const rows = onDay(food, d)
    // three states: no meals that day | meals but no salt number | measured (partial when some foods have no number)
    return { d, meals: rows.length, mg: rows.length ? dailyTotals(rows).sodiumMg : null, partial: rows.some((e) => e.sodiumMg == null) }
  }), [food, now])
  if (days.every((x) => x.meals === 0)) return null
  const word = (x: (typeof days)[number]) => x.meals === 0 ? 'nothing logged' : x.mg == null ? 'meals logged, no salt numbers' : `${fmt(x.mg)} mg${x.partial ? ', some foods have no salt number' : ''}`
  const top = Math.max(goalMg * 1.15, ...days.map((x) => x.mg ?? 0))
  return (
    <div className="mf-card" data-testid="salt-week">
      <h3 className="mf-h">Salt, last 7 days</h3>
      <div className="mf-bars" role="img" aria-label={`Sodium for 7 days, limit ${fmt(goalMg)} mg: ${days.map((x) => `${x.d.toLocaleDateString('en-US', { weekday: 'long' })} ${word(x)}`).join(', ')}`}>
        <i className="mf-limit" style={{ bottom: 22 + Math.round((goalMg / top) * 84) }} />
        {days.map((x, i) => (
          <span key={i}><i className={`${x.mg != null && x.mg > goalMg ? 'over' : ''}${x.meals === 0 ? ' none' : x.mg == null ? ' nonum' : x.partial ? ' part' : ''}`} data-state={x.meals === 0 ? 'none' : x.mg == null ? 'nonum' : x.partial ? 'partial' : 'measured'} style={{ height: x.mg == null ? 6 : Math.max(4, Math.round((x.mg / top) * 84)) }} /><b>{x.d.toLocaleDateString('en-US', { weekday: 'narrow' })}</b></span>
        ))}
      </div>
      <p className="sub">Dashed line is {fmt(goalMg)} mg. An empty outline means no meals that day. A hatched bar means meals with no salt numbers. A bar with a broken top means some foods had no number, so the total may be low.</p>
    </div>
  )
}

/** Move and food, board "Food" block: Log a meal, Salt today, Salt last 7 days and Water, all from the person's own logs. `canMark` false (someone else, or view only) hides the log buttons. */
export function FoodBlock({ personId, canMark }: { personId: string; canMark: boolean }) {
  const now = useMemo(() => new Date(), [])
  const food = useFood(personId, 2)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const [plating, setPlating] = useState(false)
  const [saved, setSaved] = useState('')
  if (!personId) return null
  return (
    <section aria-labelledby="mf-food" data-testid="food-block" className="mf">
      <h2 className="hd" id="mf-food">Food</h2>
      {canMark && !plating && <button type="button" className="btn mf-log" onClick={() => { setSaved(''); setPlating(true) }}><Icon name="meal" size={20} />Log a meal</button>}
      {canMark && plating && <div className="mf-card"><PlateSheet personId={personId} onDone={(m) => { setPlating(false); setSaved(m) }} /></div>}
      {saved && <p className="sub" role="status">{saved}</p>}
      <div className="mf-card" data-testid="salt-card">
        <h3 className="mf-h">Salt today</h3>
        <SaltSummary entries={onDay(food, now)} goalMg={goal.sodiumMg} headingId="mf-salt" />
      </div>
      <SaltWeek personId={personId} goalMg={goal.sodiumMg} />
      {goal.waterMl != null && ( // no water goal under 1 year: no Water card
        <div className="mf-card" data-testid="water-card">
          <h3 className="mf-h">Water</h3>
          <WaterPanel rows={water} goalMl={goal.waterMl} source={goal.waterSource} now={now} canAdd={canMark} personId={personId} />
        </div>
      )}
    </section>
  )
}
