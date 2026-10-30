import { useMemo, useState } from 'react'
import { ageOf } from '../family/roster'
import type { FoodEntry } from '../log/store'
import { useProfile } from '../setup/useProfile'
import { FAIL_TEXT } from '../today/actions'
import { saveGoal } from './actions'
import { useSupplements } from './hooks'
import { dailyTotals, fmt, NUTRIENT_FIELDS, unknownCount, type NutrientField } from './logic'
import { supplementTotals } from './supplements'
import { BAR_NUTRIENTS, INFO_NUTRIENTS, nutrientRows, segments, targetsFor, TARGET_NOTE, type NutrientRow, type Sex } from './targets'
import './nutrition.css'

/** 1,204 or 2.4: whole numbers get thousands separators, small ones keep one or two decimals. */
const num = (n: number) => (n >= 100 ? fmt(n) : String(Math.round(n * 100) / 100))
const unit = (u: string) => (u === 'mcg' ? 'mcg' : u)

function Row({ r }: { r: NutrientRow }) {
  const seg = segments(r)
  const { def, target: t } = r
  const word = !t || seg.totalPct == null ? null : t.kind === 'limit' ? (seg.over ? 'Over' : seg.totalPct >= 80 ? 'Near' : 'Under') : (seg.reached ? 'Reached' : null)
  const total = (r.food ?? 0) + (r.supp ?? 0)
  const empty = r.food == null && r.supp == null
  return (
    <li className="nu-nrow" data-testid={`nrow-${def.id}`}>
      <div className="nu-nhead">
        <span><b>{def.label}</b> <small>{def.tl}</small></span>
        <span className="nu-nval">{empty ? 'No number yet' : t ? `${num(total)} of ${num(t.amount)} ${unit(def.unit)}` : `${num(total)} ${unit(def.unit)}`}</span>
      </div>
      {t && (
        <div className={`nu-nbar ${t.kind === 'limit' ? (seg.over ? 'over' : (seg.totalPct ?? 0) >= 80 ? 'near' : 'ok') : 'ok'}`} role="progressbar" aria-label={`${def.label} today`} aria-valuemin={0} aria-valuemax={t.amount} aria-valuenow={Math.min(total, t.amount)}
          aria-valuetext={empty ? 'No number yet' : `${num(total)} of ${num(t.amount)} ${unit(def.unit)}${t.kind === 'limit' ? ' limit' : ''}`}>
          <i className="food" style={{ width: `${seg.foodPct}%` }} /><i className="supp" style={{ width: `${seg.suppPct}%` }} />
        </div>
      )}
      <p className="nu-sub nu-nsub">
        {t ? `${t.kind === 'limit' ? 'Limit' : 'Target'} ${num(t.amount)} ${unit(def.unit)}` : 'No target set yet'}
        {seg.totalPct != null && ` · ${seg.totalPct}%`}{word ? ` · ${word}` : ''}
        {r.food != null && r.supp != null ? ` · food ${num(r.food)}, supplements ${num(r.supp)}` : ''}
        {r.unknown > 0 && ` · ${r.unknown} ${r.unknown === 1 ? 'food has' : 'foods have'} no number, so this may be low`}
      </p>
    </li>
  )
}

/**
 * Today's nutrients: one bar per nutrient against the person's target, food and supplements as two labelled segments.
 * Targets need an age (from the profile) and a sex (saved here); until then the amounts show with no bar. A doctor-set potassium limit replaces the potassium target.
 * Supplements are read from the person's own medicine list and shown as a separate segment; this is never advice to take or stop anything.
 */
export default function NutrientsToday({ personId, entries, sodiumMg, potassiumLimit, sex, canEdit, name }: {
  personId: string; entries: FoodEntry[]; sodiumMg: number; potassiumLimit: number | null; sex: Sex | null; canEdit: boolean; name: string
}) {
  const profile = useProfile(personId)
  const supplements = useSupplements(personId)
  const [msg, setMsg] = useState('')
  const [kDraft, setKDraft] = useState('')
  const age = ageOf(profile?.birthdate ?? null)
  const totals = useMemo(() => dailyTotals(entries), [entries])
  const unknown = useMemo(() => Object.fromEntries((Object.keys(NUTRIENT_FIELDS) as NutrientField[]).map((f) => [f, unknownCount(entries, f)])), [entries])
  const { targets, missing } = useMemo(() => targetsFor({ age, sex, sodiumMg, potassiumLimitMg: potassiumLimit }), [age, sex, sodiumMg, potassiumLimit])
  const suppTotals = useMemo(() => supplementTotals(supplements), [supplements])
  const rows = useMemo(() => nutrientRows(totals, targets, suppTotals, unknown), [totals, targets, suppTotals, unknown])
  const first = name ? name.split(' ')[0]! : 'this person'
  const anySupp = rows.some((r) => r.supp != null)

  const setSex = async (s: Sex) => { setMsg(''); const r = await saveGoal(personId, { sex: s }); if (r !== 'ok') setMsg(FAIL_TEXT[r]) }
  const saveK = async (value: number | null) => {
    setMsg('')
    if (value != null && !(value >= 500 && value <= 6000)) return setMsg('Type a number from 500 to 6000 mg, or leave it blank for no limit.')
    const r = await saveGoal(personId, { potassiumMg: value })
    setMsg(r === 'ok' ? (value == null ? 'Potassium limit removed' : `Potassium limit set to ${fmt(value)} mg a day`) : FAIL_TEXT[r]); setKDraft('')
  }

  return (
    <section className="card nu-card" aria-labelledby="nu-nut" data-testid="nutrients-today">
      <h2 id="nu-nut" className="td-sech">Today&apos;s nutrients</h2>
      {missing === 'sex' && (
        <div className="nu-setup">
          <p className="nu-line">To show targets for {first}, choose female or male. Reference amounts differ.</p>
          {canEdit ? (
            <div className="nu-seg m2" role="group" aria-label="Sex for nutrient targets">
              {(['female', 'male'] as const).map((s) => <button key={s} type="button" aria-pressed={sex === s} onClick={() => void setSex(s)}>{s === 'female' ? 'Female' : 'Male'}</button>)}
            </div>
          ) : <p className="nu-sub">Only {first} or a carer who can write for them can choose.</p>}
        </div>
      )}
      {missing === 'age' && <p className="nu-note">Add a birth date on {first}&apos;s profile to see nutrient targets. Until then the amounts show without a bar.</p>}
      {missing === 'adult' && <p className="nu-note">Nutrient targets here are for adults (19 and over), so only the salt limit is shown.</p>}
      <ul className="nu-nlist" aria-label="Nutrients today">{rows.map((r) => <Row key={r.def.id} r={r} />)}</ul>
      {anySupp && (
        <p className="nu-legend" aria-hidden="true"><span><i className="food" /> From food</span><span><i className="supp" /> From supplements</span></p>
      )}
      <ul className="nu-info" aria-label="Also eaten today">
        {INFO_NUTRIENTS.map((n) => <li key={n.id}>{n.label} <small>{n.tl}</small> <b>{totals[n.id] == null ? 'No number yet' : `${num(totals[n.id]!)} ${n.unit}`}</b></li>)}
      </ul>
      <p className="nu-sub">There is no calorie, fat or sugar goal here. They are for information.</p>

      <h3 className="nu-h3" id="nu-supp">Supplements from the medicine list</h3>
      {supplements.length === 0 ? (
        <p className="nu-sub">No calcium, vitamin D, B12, iron, fish oil or multivitamin on {first}&apos;s medicine list.</p>
      ) : (
        <ul className="nu-list" aria-labelledby="nu-supp" data-testid="supp-list">
          {supplements.map((s) => (
            <li key={s.id}><span>{s.name} <span className="nu-sub">({s.label})</span></span><b>{s.taken ? `${s.taken} taken today` : 'None taken today'}</b></li>
          ))}
        </ul>
      )}
      {supplements.some((s) => s.nutrient && s.perDose != null) && <p className="nu-sub">Supplement bars may read high. Check the label.</p>}
      {supplements.some((s) => s.nutrient && s.perDose == null) && <p className="nu-sub">A supplement with no amount (for example 500 mg) on the medicine list is not counted in a bar.</p>}
      {supplements.some((s) => !s.nutrient) && <p className="nu-sub">Fish oil and multivitamins are listed but not counted in a bar.</p>}

      {canEdit && (
        <div className="nu-setup">
          <h3 className="nu-h3" id="nu-k">Doctor&apos;s potassium limit</h3>
          <p className="nu-sub">Only if your doctor set a limit (e.g. kidneys).</p>
          <p className="nu-line" data-testid="k-state">{potassiumLimit == null ? 'No limit set.' : `Limit: ${fmt(potassiumLimit)} mg a day.`}</p>
          <div className="nu-kform">
            <input className="nu-search" inputMode="numeric" value={kDraft} onChange={(e) => setKDraft(e.target.value)} placeholder="2500" aria-labelledby="nu-k" />
            <button type="button" className="nu-ghost" disabled={!kDraft.trim()} onClick={() => { const n = Number(kDraft.trim()); void saveK(Number.isFinite(n) ? Math.round(n) : NaN) }}>Save</button>
            {potassiumLimit != null && <button type="button" className="nu-ghost" onClick={() => void saveK(null)}>Remove</button>}
          </div>
        </div>
      )}
      {msg && <p className="nu-sub" role="status">{msg}</p>}
      <p className="nu-note">{TARGET_NOTE}</p>
      <details className="nu-src">
        <summary>Where the targets come from</summary>
        <ul>{[...new Set(BAR_NUTRIENTS.map((n) => n.source))].map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" style={{ color: 'var(--act)' }}>{u.replace('https://', '')}<span className="hv-sr"> (opens in new tab)</span></a></li>)}</ul>
        <p className="nu-sub">Food numbers: USDA estimates. Labels are more exact.</p>
      </details>
    </section>
  )
}
