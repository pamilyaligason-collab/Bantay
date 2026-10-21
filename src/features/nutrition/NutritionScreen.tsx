import { useMemo, useState } from 'react'
import { MetricChart } from '../health/MetricChart'
import { GUIDE, toCanonicalReading } from '../health/ranges'
import { useHealthPerson } from '../health/useHealthPerson'
import { PersonChips } from '../records/PersonChips'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { FAIL_TEXT } from '../today/actions'
import { removeFood, saveGoal } from './actions'
import { useFood, useGoal, useWater } from './hooks'
import { dailySodium, fmt, foodByKey, GOAL_NOTE, onDay, saltGrams, SODIUM_OPTIONS, WHO_SALT_URL, MEALS } from './logic'
import { SaltSummary } from './SaltSummary'
import WaterPanel from './WaterPanel'
import './nutrition.css'

const NO_DRAFTS: Record<string, number> = {}
const DAY = 86_400_000

/** Health > Food and salt (#health/nutrition): salt today, the daily limit, the week's sodium next to the week's blood pressure, and today's food. */
export default function NutritionScreen() {
  const { ready, people, ownId, personId, setPersonId, readings, canMark } = useHealthPerson()
  const now = useMemo(() => new Date(), [])
  const food = useFood(personId, 8)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const [msg, setMsg] = useState('')
  const today = useMemo(() => onDay(food, now), [food, now])
  const sodium = useMemo(() => dailySodium(food, now, 7), [food, now])
  const bp = useMemo(() => {
    const since = now.getTime() - 7 * DAY
    return readings
      .filter((r) => r.personId === personId && r.test === 'bp_systolic' && Date.parse(r.takenAt) >= since)
      .map(toCanonicalReading).filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt))
      .map((r) => ({ takenAt: r.takenAt, value: r.value }))
  }, [readings, personId, now])
  const name = people.find((p) => p.id === personId)?.name ?? ''
  const mine = !!personId && personId === ownId

  const setLimit = async (mg: number) => {
    setMsg('')
    const r = await saveGoal(personId, { sodiumMg: mg })
    setMsg(r === 'ok' ? `Salt limit set to ${fmt(mg)} mg sodium a day` : FAIL_TEXT[r])
  }
  const remove = async (id: number | undefined) => {
    const e = today.find((x) => x.id === id)
    if (e) await removeFood(e)
  }

  return (
    <>
      <SubHeader title="Food and salt" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && <p className="sub" style={{ margin: '4px 4px 0' }}>Showing: <b style={{ color: 'var(--ink)' }}>{name}</b></p>}
      {ready && personId && (
        <div className="nu" style={{ marginTop: 12 }}>
          <section className="card nu-card" aria-labelledby="nu-salt">
            <h2 id="nu-salt" className="td-sech">Salt today</h2>
            <SaltSummary entries={today} goalMg={goal.sodiumMg} headingId="nu-salt" />
            <WaterPanel rows={water} goalMl={goal.waterMl} now={now} canAdd={mine} />
            {mine && <div className="nu-act"><a className="nu-ghost" href="#today"><Icon name="meal" size={20} />Log a meal from Today</a></div>}
          </section>

          <section className="card nu-card" aria-labelledby="nu-limit">
            <h2 id="nu-limit" className="td-sech">Daily salt limit</h2>
            <p className="nu-line"><b data-testid="limit">{fmt(goal.sodiumMg)} mg</b> sodium a day, about {saltGrams(goal.sodiumMg)} g of salt.</p>
            {canMark ? (
              <div className="nu-seg m2" role="group" aria-label="Salt limit">
                {SODIUM_OPTIONS.map((mg) => <button key={mg} type="button" aria-pressed={goal.sodiumMg === mg} onClick={() => void setLimit(mg)}>{fmt(mg)} mg</button>)}
              </div>
            ) : <p className="nu-sub">Only {name ? name.split(' ')[0] : 'this person'} or a carer who can write for them can change the limit.</p>}
            {msg && <p className="nu-sub" role="status">{msg}</p>}
            <p className="nu-note">{GOAL_NOTE}. The WHO says adults should have less than 2000 mg of sodium a day (about 5 g of salt).{' '}
              <a href={WHO_SALT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--act)' }}>WHO fact sheet<span className="hv-sr"> (opens in new tab)</span></a>
            </p>
          </section>

          <section aria-labelledby="nu-week">
            <h2 id="nu-week" className="hd">This week</h2>
            <div className="grp hv-graph" style={{ padding: 8 }}>
              <p className="nu-lab" style={{ margin: '6px 8px' }}>Sodium eaten each day (mg)</p>
              {sodium.length === 0
                ? <p className="sub" style={{ margin: 0, padding: 16 }}>No meals logged in the last 7 days. Days with nothing logged are left blank, not counted as zero.</p>
                : <MetricChart pts={sodium} days={7} now={now} band={{ low: null, high: goal.sodiumMg }} label="Sodium eaten each day, last 7 days" unit="mg" />}
            </div>
            <div className="grp hv-graph" style={{ padding: 8, marginTop: 10 }}>
              <p className="nu-lab" style={{ margin: '6px 8px' }}>Blood pressure, top number (mmHg)</p>
              {bp.length === 0
                ? <p className="sub" style={{ margin: 0, padding: 16 }}>No blood pressure readings in the last 7 days.</p>
                : <MetricChart pts={bp} days={7} now={now} band={GUIDE.bp_systolic ?? null} label="Blood pressure top number, last 7 days" unit="mmHg" />}
            </div>
            <p className="nu-sub" style={{ margin: '8px 4px 0' }}>Salt can raise blood pressure in some people. These two charts share the same 7 days so you can look at them together. This is not a diagnosis; talk to your doctor.</p>
          </section>

          <section aria-labelledby="nu-food">
            <h2 id="nu-food" className="hd">Food today</h2>
            {today.length === 0 ? <div className="grp"><div className="row"><span className="grow">Nothing logged yet<span className="sub">Use Meal on Today to add what was eaten.</span></span></div></div> : (
              <ul className="grp nu-foodlist" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...today].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)).map((e) => (
                  <li className="row" key={e.clientId}>
                    <span className="grow">
                      {foodByKey(e.foodKey)?.tl ?? e.name}
                      <span className="sub">{MEALS.find((m) => m.id === e.meal)?.en} · {e.portion === 0.5 ? 'Small' : e.portion === 1.5 ? 'Large' : e.portion === 1 ? 'Normal' : `x${e.portion}`}{e.sodiumMg != null ? ` · ${fmt(e.sodiumMg)} mg sodium` : ' · no salt number'}</span>
                    </span>
                    {canMark && <button type="button" className="nu-ghost" onClick={() => void remove(e.id)} aria-label={`Remove ${foodByKey(e.foodKey)?.tl ?? e.name}`}>Remove</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="nu-sub">Food numbers come from USDA FoodData Central and are estimates for a typical serving. A packaged food label is more exact.</p>
        </div>
      )}
    </>
  )
}
