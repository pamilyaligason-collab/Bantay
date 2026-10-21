import { useMemo, useRef, useState } from 'react'
import type { Meal } from '../log/store'
import { useSelfPersonId } from '../setup/useProfile'
import { Icon } from '../shell/Icon'
import { FAIL_TEXT } from '../today/actions'
import { logPlate, logSameAsYesterday } from './actions'
import { useFood } from './hooks'
import { copyMeal, FOODS, fmt, foodByKey, MEALS, mealAt, PORTIONS, recentFoods, SALTY_KEYS, scale, searchFoods, type Food } from './logic'
import './nutrition.css'

type Picked = { id: number; food: Food; portion: number }

/** The Plate sheet: pick a meal, tap dishes (Tagalog and English names, or search), choose Small / Normal / Large, save. "Same as yesterday" copies that meal. Salty items are one tap. */
export default function PlateSheet({ onDone }: { onDone(msg: string): void }) {
  const personId = useSelfPersonId() ?? ''
  const history = useFood(personId, 14)
  const [meal, setMeal] = useState<Meal>(() => mealAt(new Date()))
  const [portion, setPortion] = useState(1)
  const [q, setQ] = useState('')
  const [plate, setPlate] = useState<Picked[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const sameN = useMemo(() => copyMeal(history, meal, new Date(), () => '').length, [history, meal])
  const recent = useMemo(() => recentFoods(history, 6), [history])
  const list = useMemo(() => searchFoods(q), [q])
  const salty = SALTY_KEYS.map((k) => foodByKey(k)).filter((f): f is Food => !!f)
  const mealName = MEALS.find((m) => m.id === meal)!
  const plateMg = plate.reduce<number | null>((a, p) => { const v = scale(p.food.sodium_mg, p.portion); return v == null ? a : (a ?? 0) + v }, null)

  const add = (food: Food) => { setErr(''); setPlate((p) => [...p, { id: ++seq.current, food, portion }]) }
  const fail = (r: 'signedout' | 'failed') => setErr(FAIL_TEXT[r])
  const save = async () => {
    if (busy || !plate.length) return
    setBusy(true)
    const r = await logPlate(plate.map((p) => ({ food: p.food, portion: p.portion })), meal)
    setBusy(false)
    if (r === 'ok') onDone(`Saved ${plate.length} ${plate.length === 1 ? 'food' : 'foods'} for ${mealName.en.toLowerCase()}`)
    else fail(r)
  }
  const salt = async (f: Food) => {
    if (busy) return
    setBusy(true)
    const r = await logPlate([{ food: f, portion: 1 }], meal)
    setBusy(false)
    if (r === 'ok') onDone(`Saved ${f.tl}`)
    else fail(r)
  }
  const same = async () => {
    if (busy) return
    setBusy(true)
    const { result, added } = await logSameAsYesterday(meal)
    setBusy(false)
    if (result !== 'ok') return fail(result)
    if (added) onDone(`Saved yesterday's ${mealName.en.toLowerCase()} again`)
    else setErr(`Nothing was logged for ${mealName.en.toLowerCase()} yesterday.`)
  }

  const tile = (f: Food) => (
    <li key={f.key}>
      <button type="button" className="nu-tile" onClick={() => add(f)} aria-label={`Add ${f.tl}, ${f.name}, ${f.serving_label}${f.estimate ? ', estimate' : ''}`}>
        <b>{f.tl}</b>
        <span>{f.name}</span>
        <em>{f.serving_label}</em>
        {f.estimate && <small className="nu-est">Estimate</small>}
      </button>
    </li>
  )

  return (
    <div className="nu">
      <div role="group" aria-label="Meal">
        <p className="nu-lab" id="nu-meal-l">Which meal?</p>
        <div className="nu-seg m4" aria-labelledby="nu-meal-l" role="group">
          {MEALS.map((m) => <button key={m.id} type="button" aria-pressed={meal === m.id} onClick={() => { setMeal(m.id); setErr('') }}>{m.tl}<small>{m.en}</small></button>)}
        </div>
      </div>
      <button type="button" className="nu-ghost" disabled={busy || sameN === 0} onClick={() => void same()}>
        <Icon name="rotate" size={20} />Same as yesterday{sameN ? ` (${sameN} ${sameN === 1 ? 'food' : 'foods'})` : ''}
      </button>
      {sameN === 0 && <p className="nu-sub" style={{ marginTop: -6 }}>Nothing was logged for {mealName.en.toLowerCase()} yesterday.</p>}
      <div>
        <p className="nu-lab" id="nu-salty-l">Salty extras, one tap</p>
        <div className="nu-chips" role="group" aria-labelledby="nu-salty-l">
          {salty.map((f) => <button key={f.key} type="button" className="nu-chip" disabled={busy} onClick={() => void salt(f)} aria-label={`Add ${f.tl} to ${mealName.en}, ${f.serving_label}`}>{f.tl}<small>{f.sodium_mg == null ? '–' : `${fmt(f.sodium_mg)} mg`}{f.estimate ? ' (estimate)' : ''}</small></button>)}
        </div>
      </div>
      <div>
        <p className="nu-lab" id="nu-size-l">How much?</p>
        <div className="nu-seg m3" role="group" aria-labelledby="nu-size-l">
          {PORTIONS.map((p) => <button key={p.id} type="button" aria-pressed={portion === p.value} onClick={() => setPortion(p.value)}>{p.label}</button>)}
        </div>
      </div>
      <input className="nu-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: adobo, sinigang, kanin" aria-label="Search foods" enterKeyHint="search" />
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
      <div className="nu-plate">
        <p className="nu-total" role="status" aria-live="polite">
          {plate.length ? <><b>{plate.length} on your plate</b>{plateMg != null ? ` · about ${fmt(plateMg)} mg sodium` : ''}</> : 'Tap a dish to put it on your plate.'}
        </p>
        {plate.length > 0 && (
          <ul className="nu-picked" aria-label="On your plate">
            {plate.map((p) => (
              <li key={p.id}>
                <button type="button" className="nu-pick" onClick={() => setPlate((l) => l.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.food.tl}, ${PORTIONS.find((x) => x.value === p.portion)?.label ?? ''}`}>
                  {p.food.tl} ({PORTIONS.find((x) => x.value === p.portion)?.label.toLowerCase()})<Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="nu-err" role="alert">{err}</p>}
        <button type="button" className="nu-big-btn" disabled={busy || !plate.length} onClick={() => void save()}>Save meal</button>
      </div>
    </div>
  )
}
