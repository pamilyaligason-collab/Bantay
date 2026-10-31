import { useEffect, useMemo, useState } from 'react'
import { useActingPersonId } from '../viewas/viewAs'
import { Icon, type IconName } from '../shell/Icon'
import type { FoodEntry } from '../log/store'
import { useFood, useGoal } from './hooks'
import { BAND_WORD, dailyTotals, fillPct, fmt, goalBand, onDay, saltGrams, topSodium, type Band } from './logic'
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
      {t.count > 0 && (
        <p className="nu-keys" data-testid="day-keys">
          <span>Energy <b>{t.kcal == null ? '–' : `${fmt(t.kcal)} kcal`}</b></span><span>Protein <b>{t.proteinG == null ? '–' : `${t.proteinG} g`}</b></span>
          <span>Carbs <b>{t.carbsG == null ? '–' : `${t.carbsG} g`}</b></span><span>Fibre <b>{t.fiberG == null ? '–' : `${t.fiberG} g`}</b></span>
        </p>
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

/** The words on Today's salt line. Meals logged with no sodium number say so; that is not "nothing logged", and never a made-up 0. */
export function saltLineText(entries: FoodEntry[], goalMg: number): string {
  const mg = dailyTotals(entries).sodiumMg
  if (mg != null) return `Salt ${fmt(mg)} of ${fmt(goalMg)} mg today`
  return entries.length ? "Salt: not known for today's meals" : 'Salt: nothing logged yet today'
}

/** Today's one salt line (the Meals card moved to Health > Food, D-62 / mockup v8): this phone's member, "Salt 1,300 of 1,500 mg today", a link to Health > Food and nutrients.
 *  Nothing until signed in. With nothing logged, or meals without a salt number, it says so instead of a made-up 0. */
export default function SaltLine() {
  const personId = useActingPersonId() ?? ''
  const now = useNow()
  const food = useFood(personId, 2)
  const goal = useGoal(personId)
  const text = useMemo(() => saltLineText(onDay(food, now), goal.sodiumMg), [food, now, goal.sodiumMg])
  if (!personId) return null
  return (
    <a className="td-saltline press" href="#health/nutrition" data-testid="salt-line">
      <span>{text}</span>
      <span className="td-link">Food</span>
    </a>
  )
}
