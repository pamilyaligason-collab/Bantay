import { useMemo, useState } from 'react'
import { MetricChart } from '../health/MetricChart'
import { GUIDE, toCanonicalReading } from '../health/ranges'
import { useHealthPerson } from '../health/useHealthPerson'
import { PersonChips } from '../records/PersonChips'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { FAIL_TEXT } from '../today/actions'
import NutrientsToday from './NutrientsToday'
import { removeFood, saveGoal } from './actions'
import { useFood, useGoal, useWater } from './hooks'
import { dailySodium, fmt, foodByKey, GOAL_NOTE, onDay, portionWord, saltGrams, SODIUM_OPTIONS, WHO_SALT_URL, MEALS } from './logic'
import { SaltSummary } from './SaltSummary'
import PlateSheet from './PlateSheet'
import WaterPanel from './WaterPanel'
import './nutrition.css'

const NO_DRAFTS: Record<string, number> = {}
const DAY = 86_400_000

/** Health > Food and nutrients (#health/nutrition): salt today, the daily limit, the week's sodium next to the week's blood pressure, and today's food. */
export default function NutritionScreen() {
  const { ready, people, ownId, personId, setPersonId, readings, canMark } = useHealthPerson()
  const now = useMemo(() => new Date(), [])
  const food = useFood(personId, 8)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const [msg, setMsg] = useState('')
  const [saved, setSaved] = useState('')
  const [plating, setPlating] = useState(false) // the Log a meal form, open in place (the Meals card left Today)
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
      <SubHeader title="Food and nutrients" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && <p className="who-chip"><span className="hv-sr">Showing </span><span aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>{name}</p>}
      {ready && personId && (
        <div className="nu" style={{ marginTop: 12 }}>
          <section className="card nu-card" aria-labelledby="nu-salt">
            <h2 id="nu-salt" className="td-sech">Salt and meals today</h2>
            <SaltSummary entries={today} goalMg={goal.sodiumMg} headingId="nu-salt" />
            <WaterPanel rows={water} goalMl={goal.waterMl} now={now} canAdd={canMark} personId={personId} />
            {canMark && !plating && <div className="nu-act"><button type="button" className="nu-big-btn" onClick={() => setPlating(true)}><Icon name="meal" size={24} />Log a meal</button></div>}
            {canMark && plating && <PlateSheet personId={personId} onDone={(m) => { setPlating(false); setSaved(m) }} />}
            {saved && canMark && <p className="nu-sub" role="status">{saved}</p>}
          </section>

          <NutrientsToday personId={personId} entries={today} sodiumMg={goal.sodiumMg} potassiumLimit={goal.potassiumMg} sex={goal.sex} canEdit={canMark} name={name} />

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
            <p className="nu-sub" style={{ margin: '8px 4px 0' }}>Salt and blood pressure, same 7 days. Not a diagnosis.</p>
          </section>

          <section aria-labelledby="nu-food">
            <h2 id="nu-food" className="hd">Food today</h2>
            {today.length === 0 ? <div className="grp"><div className="row"><span className="grow">Nothing logged yet<span className="sub">Use Log a meal above to add what was eaten.</span></span></div></div> : (
              <ul className="grp nu-foodlist" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...today].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)).map((e) => (
                  <li className="row" key={e.clientId}>
                    <span className="grow">
                      {foodByKey(e.foodKey)?.tl ?? e.name}
                      <span className="sub">{MEALS.find((m) => m.id === e.meal)?.en} · {portionWord(e.portion)}{e.sodiumMg != null ? ` · ${fmt(e.sodiumMg)} mg sodium` : ' · no salt number'}</span>
                    </span>
                    {canMark && <button type="button" className="nu-ghost" onClick={() => void remove(e.id)} aria-label={`Remove ${foodByKey(e.foodKey)?.tl ?? e.name}`}>Remove</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  )
}
