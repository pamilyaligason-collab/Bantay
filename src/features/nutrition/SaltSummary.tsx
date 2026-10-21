import { useEffect, useMemo, useState } from 'react'
import { useSelfPersonId } from '../setup/useProfile'
import { Icon, type IconName } from '../shell/Icon'
import type { FoodEntry } from '../log/store'
import { useFood, useGoal, useWater } from './hooks'
import { BAND_WORD, dailyTotals, fillPct, fmt, goalBand, onDay, saltGrams, topSodium, type Band } from './logic'
import WaterPanel from './WaterPanel'
import './nutrition.css'

const BAND_ICON: Record<Exclude<Band, 'none'>, IconName> = { under: 'check', near: 'info', over: 'warn' }
const BAND_LINE: Record<Exclude<Band, 'none'>, string> = { under: 'Under your limit', near: 'Close to your limit', over: 'Over your limit' }

/** Salt today for one person: a bar from 0 to the sodium goal, a word (Under / Near / Over), mg and grams of salt, the 3 saltiest foods. Calories are information only. */
export function SaltSummary({ entries, goalMg, headingId, children }: { entries: FoodEntry[]; goalMg: number; headingId: string; children?: React.ReactNode }) {
  const t = useMemo(() => dailyTotals(entries), [entries])
  const top = useMemo(() => topSodium(entries, 3), [entries])
  const band = goalBand(t.sodiumMg, goalMg)
  const unknown = entries.filter((e) => e.sodiumMg == null).length
  return (
    <>
      {t.sodiumMg == null || band === 'none' ? (
        <p className="nu-line">{entries.length ? 'No salt numbers for what was logged.' : 'Nothing logged yet today.'}</p>
      ) : (
        <>
          <div className="nu-top">
            <b className="nu-big" data-testid="salt-mg">{fmt(t.sodiumMg)}<small> mg sodium</small></b>
            <span className={`nu-band ${band}`} data-testid="salt-band"><Icon name={BAND_ICON[band]} size={20} />{BAND_WORD[band]}</span>
          </div>
          <div className={`nu-bar ${band}`} role="progressbar" aria-label="Sodium today" aria-valuemin={0} aria-valuemax={goalMg} aria-valuenow={Math.min(t.sodiumMg, goalMg)} aria-valuetext={`${fmt(t.sodiumMg)} of ${fmt(goalMg)} milligrams. ${BAND_LINE[band]}.`}>
            <i style={{ transform: `scaleX(${fillPct(t.sodiumMg, goalMg) / 100})` }} /><span className="nu-tick" aria-hidden="true" />
          </div>
          <p className="nu-scale" aria-hidden="true"><span>0</span><span>{fmt(goalMg)} mg limit</span></p>
          <p className="nu-line">About <b data-testid="salt-g">{saltGrams(t.sodiumMg)} g</b> of salt. {BAND_LINE[band]}: your limit is {fmt(goalMg)} mg sodium, about {saltGrams(goalMg)} g of salt.</p>
          {unknown > 0 && <p className="nu-sub">{unknown} {unknown === 1 ? 'food has' : 'foods have'} no salt number, so the total may be low.</p>}
        </>
      )}
      {top.length > 0 && (
        <div>
          <h3 className="nu-h3" id={`${headingId}-top`}>Saltiest today</h3>
          <ol className="nu-list" aria-labelledby={`${headingId}-top`} data-testid="salt-top">
            {top.map((f) => <li key={f.key}><span>{f.tl ?? f.name}{f.tl && f.tl !== f.name ? <span className="nu-sub"> ({f.name})</span> : null}</span><b>{fmt(f.sodiumMg)} mg</b></li>)}
          </ol>
        </div>
      )}
      {t.kcal != null && <p className="nu-sub" data-testid="kcal">About {fmt(t.kcal)} kcal eaten today. For information only, there is no calorie goal.</p>}
      {children}
    </>
  )
}

const useNow = () => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])
  return now
}

/** Today's "Salt today" card: this phone's member. Shows once signed in; links to Health > Food and salt. */
export default function SaltTodayCard({ onMeal }: { onMeal(): void }) {
  const personId = useSelfPersonId() ?? ''
  const now = useNow()
  const food = useFood(personId, 2)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const today = useMemo(() => onDay(food, now), [food, now])
  if (!personId) return null
  return (
    <section className="card nu-card nu" aria-labelledby="t-salt" data-reveal>
      <div className="td-row between">
        <h2 id="t-salt" className="td-sech">Salt today</h2>
        <a className="td-link" href="#health/nutrition">See the week</a>
      </div>
      <SaltSummary entries={today} goalMg={goal.sodiumMg} headingId="t-salt">
        <div className="nu-act"><button type="button" className="nu-ghost" onClick={onMeal}><Icon name="meal" size={20} />Log a meal</button></div>
      </SaltSummary>
      <WaterPanel rows={water} goalMl={goal.waterMl} now={now} />
    </section>
  )
}
