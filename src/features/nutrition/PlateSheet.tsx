import { useMemo, useRef, useState } from 'react'
import type { Meal } from '../log/store'
import { useActingCan, useActingPersonId } from '../viewas/viewAs'
import { Icon } from '../shell/Icon'
import { FAIL_TEXT } from '../today/actions'
import { logPlate, logSameAsYesterday } from './actions'
import { useFood, useGoal } from './hooks'
import {
  BAND_WORD, copyMeal, customFood, dailyTotals, favouriteFoods, fillPct, FOODS, fmt, foodByKey, foodEmoji, goalBand, isHighSalt, MEALS, mealAt, onDay, PORTIONS,
  plateTotals, portionWord, recentFoods, SALTY_KEYS, searchFoods, type Food
} from './logic'
import './nutrition.css'

type Picked = { id: number; food: Food; portion: number }

/** "42 g" or a dash: unknown is a dash, never 0. */
const amt = (n: number | null | undefined, unit: string, d = 0) => (n == null ? '–' : `${d ? n.toFixed(d) : fmt(n)} ${unit}`)

/**
 * Log a meal. The meal is chosen from the clock (a chip changes it). Big dish tiles with a picture, Eaten lately and Favourites first, a search,
 * salty extras and "add your own" if the dish is not on the list. Every dish on the plate has its own half / 1 / 1½ / 2 stepper, and the
 * summary under it shows the salt of this plate against today's limit and the key nutrients, live. Salt is part of the meal, not a separate log.
 */
export default function PlateSheet({ onDone, personId: forPerson }: { onDone(msg: string): void; personId?: string }) {
  const acting = useActingPersonId() ?? ''
  const personId = forPerson ?? acting // an explicit person (Food screen, carer logging for Ma) beats the signed-in one
  const can = useActingCan()
  const locked = !!can && !can.log
  const history = useFood(personId, 30)
  const goal = useGoal(personId)
  const [meal, setMeal] = useState<Meal>(() => mealAt(new Date()))
  const [changing, setChanging] = useState(false)
  const [q, setQ] = useState('')
  const [plate, setPlate] = useState<Picked[]>([])
  const [own, setOwn] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const sameN = useMemo(() => copyMeal(history, meal, new Date(), () => '').length, [history, meal])
  const recent = useMemo(() => recentFoods(history, 6), [history])
  const favs = useMemo(() => favouriteFoods(history, 6), [history])
  const list = useMemo(() => searchFoods(q), [q])
  const salty = SALTY_KEYS.map((k) => foodByKey(k)).filter((f): f is Food => !!f)
  const mealName = MEALS.find((m) => m.id === meal)!
  const eaten = useMemo(() => dailyTotals(onDay(history, new Date())), [history])
  const totals = useMemo(() => plateTotals(plate), [plate])
  const dayMg = totals.sodiumMg == null ? null : (eaten.sodiumMg ?? 0) + totals.sodiumMg
  const band = goalBand(dayMg, goal.sodiumMg)
  const unknownSalt = plate.filter((p) => p.food.sodium_mg == null).length

  const add = (food: Food) => { setErr(''); setPlate((p) => [...p, { id: ++seq.current, food, portion: 1 }]) }
  const step = (id: number, dir: 1 | -1) => setPlate((l) => l.map((p) => {
    if (p.id !== id) return p
    const i = PORTIONS.findIndex((x) => x.value === p.portion)
    return { ...p, portion: PORTIONS[Math.max(0, Math.min(PORTIONS.length - 1, i + dir))]!.value }
  }))
  const fail = (r: 'signedout' | 'failed') => setErr(FAIL_TEXT[r])
  const save = async () => {
    if (busy || locked || !plate.length) return
    setBusy(true)
    const r = await logPlate(plate.map((p) => ({ food: p.food, portion: p.portion })), meal, new Date(), personId || undefined)
    setBusy(false)
    if (r === 'ok') onDone(`Saved ${plate.length} ${plate.length === 1 ? 'food' : 'foods'} for ${mealName.en.toLowerCase()}`)
    else fail(r)
  }
  const same = async () => {
    if (busy || locked) return
    setBusy(true)
    const { result, added } = await logSameAsYesterday(meal, new Date(), personId || undefined)
    setBusy(false)
    if (result !== 'ok') return fail(result)
    if (added) onDone(`Saved yesterday's ${mealName.en.toLowerCase()} again`)
    else setErr(`Nothing was logged for ${mealName.en.toLowerCase()} yesterday.`)
  }
  const addOwn = () => {
    const name = (own ?? '').trim()
    if (!name) return setErr('Type the name of the food.')
    add(customFood(name)); setOwn(null); setQ('')
  }

  const tile = (f: Food) => {
    const high = isHighSalt(f)
    return (
      <li key={f.key}>
        <button type="button" className="nu-tile" onClick={() => add(f)} aria-label={`Add ${f.tl}, ${f.name}, ${f.serving_label}${high ? ', high salt' : ''}${f.estimate ? ', estimate' : ''}`}>
          <span className="nu-pic" aria-hidden="true">{foodEmoji(f.key)}</span>
          <b>{f.tl}</b>
          <span>{f.name}</span>
          <em>{f.serving_label}{f.sodium_mg != null ? ` · ${fmt(f.sodium_mg)} mg salt` : ''}</em>
          {(high || f.estimate) && <span className="nu-tags">{high && <small className="nu-high">High salt</small>}{f.estimate && <small className="nu-est">Estimate</small>}</span>}
        </button>
      </li>
    )
  }

  return (
    <div className="nu">
      <div className="nu-mealbar">
        <button type="button" className="nu-mealchip" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
          <span><small>For</small> <b>{mealName.tl}</b> <small>{mealName.en}</small></span>
          <span className="nu-change">{changing ? 'Done' : 'Change'}</span>
        </button>
        {sameN > 0 && (
          <button type="button" className="nu-ghost" disabled={busy} onClick={() => void same()}>
            <Icon name="rotate" size={20} />Same as yesterday ({sameN} {sameN === 1 ? 'food' : 'foods'})
          </button>
        )}
      </div>
      {changing && (
        <div className="nu-seg m4" role="group" aria-label="Meal">
          {MEALS.map((m) => <button key={m.id} type="button" aria-pressed={meal === m.id} onClick={() => { setMeal(m.id); setErr(''); setChanging(false) }}>{m.tl}<small>{m.en}</small></button>)}
        </div>
      )}
      <input className="nu-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: adobo, sinigang, kanin" aria-label="Search foods" enterKeyHint="search" />
      {!q.trim() && favs.length > 0 && (
        <section aria-labelledby="nu-fav">
          <p className="nu-lab" id="nu-fav">Your favourites</p>
          <ul className="nu-tiles">{favs.map(tile)}</ul>
        </section>
      )}
      {!q.trim() && recent.length > 0 && (
        <section aria-labelledby="nu-recent">
          <p className="nu-lab" id="nu-recent">Eaten lately</p>
          <ul className="nu-tiles">{recent.map(tile)}</ul>
        </section>
      )}
      <section aria-labelledby="nu-all">
        <p className="nu-lab" id="nu-all">{q.trim() ? `${list.length} found` : `All foods (${FOODS.length})`}</p>
        {list.length ? <ul className="nu-tiles">{list.map(tile)}</ul> : <p className="nu-empty">No match. Try another word, in Tagalog or English.</p>}
      </section>
      <section aria-labelledby="nu-salty" className="nu-saltbox">
        <p className="nu-lab" id="nu-salty">Salty extras on this meal</p>
        <div className="nu-chips" role="group" aria-labelledby="nu-salty">
          {salty.map((f) => <button key={f.key} type="button" className="nu-chip" onClick={() => add(f)} aria-label={`Add ${f.tl} to your plate, ${f.serving_label}`}>{f.tl}<small>{f.sodium_mg == null ? '–' : `${fmt(f.sodium_mg)} mg`}{f.estimate ? ' (estimate)' : ''}</small></button>)}
        </div>
      </section>
      <section aria-labelledby="nu-own">
        <p className="nu-lab" id="nu-own">Not on the list?</p>
        {own == null ? (
          <button type="button" className="nu-ghost" onClick={() => { setOwn(q.trim()); setErr('') }}><Icon name="plus" size={20} />Add your own food</button>
        ) : (
          <div className="nu-ownform">
            <input className="nu-search" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Name of the food" aria-label="Name of your own food" maxLength={120} autoFocus />
            <button type="button" className="nu-big-btn" onClick={addOwn}>Add to plate</button>
            <p className="nu-sub">No numbers are saved for it, so it adds nothing to your salt total.</p>
          </div>
        )}
      </section>
      <div className="nu-plate">
        {plate.length === 0 ? <p className="nu-total" role="status" aria-live="polite">Tap a dish to put it on your plate.</p> : (
          <>
            <p className="nu-total" role="status" aria-live="polite"><b>{plate.length} on your plate</b></p>
            <ul className="nu-picked" aria-label="On your plate">
              {plate.map((p) => (
                <li key={p.id} className="nu-pickrow">
                  <span className="nu-pickname"><span aria-hidden="true">{foodEmoji(p.food.key)}</span> {p.food.tl}</span>
                  <span className="nu-step" role="group" aria-label={`Portion of ${p.food.tl}`}>
                    <button type="button" onClick={() => step(p.id, -1)} disabled={p.portion === PORTIONS[0].value} aria-label={`Less ${p.food.tl}`}>−</button>
                    <b>{PORTIONS.find((x) => x.value === p.portion)?.label}<span className="hv-sr"> {portionWord(p.portion)}</span></b>
                    <button type="button" onClick={() => step(p.id, 1)} disabled={p.portion === PORTIONS[PORTIONS.length - 1]!.value} aria-label={`More ${p.food.tl}`}>+</button>
                  </span>
                  <button type="button" className="nu-x" onClick={() => setPlate((l) => l.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.food.tl}`}><Icon name="close" size={20} /></button>
                </li>
              ))}
            </ul>
            <div className="nu-live" data-testid="plate-live">
              {totals.sodiumMg == null ? <p className="nu-line">No salt number for what is on your plate.</p> : (
                <>
                  <p className="nu-line"><b data-testid="plate-salt">{fmt(totals.sodiumMg)} mg</b> salt in this meal{band !== 'none' ? <> · <span className={`nu-band ${band}`}>{BAND_WORD[band]}</span></> : null}</p>
                  <div className={`nu-bar ${band}`} role="progressbar" aria-label="Salt today with this meal" aria-valuemin={0} aria-valuemax={goal.sodiumMg} aria-valuenow={Math.min(dayMg ?? 0, goal.sodiumMg)} aria-valuetext={`${fmt(dayMg ?? 0)} of ${fmt(goal.sodiumMg)} milligrams today`}>
                    <i style={{ transform: `scaleX(${fillPct(dayMg, goal.sodiumMg) / 100})` }} /><span className="nu-tick" aria-hidden="true" />
                  </div>
                  <p className="nu-sub">{fmt(dayMg ?? 0)} of {fmt(goal.sodiumMg)} mg for today{unknownSalt ? `. ${unknownSalt} on the plate ${unknownSalt === 1 ? 'has' : 'have'} no salt number.` : '.'}</p>
                </>
              )}
              <p className="nu-keys" data-testid="plate-keys">
                <span>Energy <b>{amt(totals.kcal, 'kcal')}</b></span><span>Protein <b>{amt(totals.proteinG, 'g', 1)}</b></span>
                <span>Carbs <b>{amt(totals.carbsG, 'g', 1)}</b></span><span>Fibre <b>{amt(totals.fiberG, 'g', 1)}</b></span>
              </p>
            </div>
          </>
        )}
        {err && <p className="nu-err" role="alert">{err}</p>}
        <button type="button" className="nu-big-btn" disabled={busy || !plate.length} onClick={() => void save()}>Save meal</button>
      </div>
    </div>
  )
}
