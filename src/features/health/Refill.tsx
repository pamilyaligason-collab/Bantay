import { useMemo, useState } from 'react'
import '../family/family.css'
import '../setup/setup.css'
import Sheet from '../family/Sheet'
import { addTask, allTasks } from '../family/tasks'
import type { Medication } from '../log/store'
import { PersonChips } from '../records/PersonChips'
import { SubHeader } from '../shell/SubHeader'
import { setStock } from './medActions'
import { asNeededNames, dateWords, perDayOf, refillLine, refillTask, stockRows, uncounted, type StockRow } from './stock'
import { useHealthPerson } from './useHealthPerson'
import { useMedications } from './useMedications'
import './health.css'
import './m7a.css'

const NO_DRAFTS: Record<string, number> = {}

/** Set or reset a medicine's count: how many are left right now (and how many a day when that is not known). */
function StockSheet({ med, onClose }: { med: Medication; onClose: () => void }) {
  const per = perDayOf(med)
  const [qty, setQty] = useState(typeof med.stockQty === 'number' ? String(med.stockQty) : '')
  const [daily, setDaily] = useState(String(per ?? 1))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const n = Number(qty)
    const d = Number(daily)
    if (qty.trim() === '' || !Number.isFinite(n) || n < 0) return setErr('Type how many are left, for example 14.')
    if (!Number.isFinite(d) || d <= 0) return setErr('Type how many are taken a day, for example 2.')
    setBusy(true)
    try { await setStock(med, n, per == null || d !== per ? { perDay: d } : {}); onClose() } catch { setErr('Could not save on this phone. Try again.'); setBusy(false) }
  }
  return (
    <Sheet title={`Count ${med.name}`} onClose={onClose}>
      <div className="fm-form md-form">
        <label htmlFor="rf-qty">How many are left now?</label>
        <input id="rf-qty" inputMode="numeric" value={qty} autoComplete="off" onChange={(e) => setQty(e.target.value)} />
        {per == null && (<>
          <label htmlFor="rf-per">How many do you take a day?</label>
          <input id="rf-per" inputMode="decimal" value={daily} autoComplete="off" onChange={(e) => setDaily(e.target.value)} />
        </>)}
        <p className="sub">Days left are counted from today. Count again after you buy more.</p>
        {err && <p className="md-err" role="alert">{err}</p>}
        <div className="md-foot"><button type="button" className="btn" disabled={busy} onClick={() => void save()}>Save</button></div>
      </div>
    </Sheet>
  )
}

/** #health/refill: days of medicine left, the refill date, a Plan task on tap, and a way to set the count. */
export default function Refill() {
  const { people, ownId, personId, setPersonId, canEdit } = useHealthPerson()
  const meds = useMedications(personId)
  const now = useMemo(() => new Date(), [])
  const rows = stockRows(meds, personId, now)
  const todo = uncounted(meds, personId)
  const asNeeded = asNeededNames(meds, personId)
  const name = people.find((p) => p.id === personId)?.name ?? ''
  const [edit, setEdit] = useState<Medication | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [note, setNote] = useState('')
  const soon = rows.find((r) => r.low)

  const toPlan = async (r: StockRow) => {
    const t = refillTask(r.name, r.by)
    const dup = (await allTasks()).some((x) => !x.done && x.title === t.title)
    if (!dup) await addTask({ title: t.title, due: t.due })
    setAdded((a) => [...a, r.name])
    setNote(dup ? `${r.name} is already in the Plan.` : `Added to the Plan for ${dateWords(r.by)}.`)
  }

  return (
    <>
      <SubHeader title="Refill and stock" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && <p className="sub" style={{ margin: '4px 4px 0' }}>Counts for <b style={{ color: 'var(--ink)' }}>{name}</b></p>}

      {soon && (
        <div className="card rf-hero" data-testid="refill-soon">
          <b>{soon.name}: {soon.days === 0 ? 'runs out today' : `${soon.days} ${soon.days === 1 ? 'day' : 'days'} left`}</b>
          <span className="sub">Refill by {dateWords(soon.by)}.</span>
          {canEdit && <button type="button" className="btn" disabled={added.includes(soon.name)} onClick={() => void toPlan(soon)}>{added.includes(soon.name) ? 'In the Plan' : 'Add refill to plan'}</button>}
        </div>
      )}
      {note && <p className="sub rf-note" role="status">{note}</p>}

      {rows.length === 0 && todo.length === 0 ? (
        <div className="card rf-hero"><b>Nothing to count yet</b><span className="sub">Add a medicine with times in Health &gt; Medicines, then count what is left.</span></div>
      ) : (
        <ul className="grp rf-list" aria-label="Medicines and days left">
          {rows.map((r) => (
            <li key={r.med.clientId ?? r.name} className="row rf-row" data-low={r.low || undefined}>
              <span className="grow"><b>{r.name}</b><span className="sub">{r.left} {r.unit} · {r.perDay} a day</span><span className="sub">{refillLine(r.days, r.by)}</span></span>
              {canEdit && (
                <span className="rf-acts">
                  {r.low && !added.includes(r.name) && <button type="button" className="md-pill" onClick={() => void toPlan(r)} aria-label={`Add ${r.name} refill to plan`}>Plan</button>}
                  <button type="button" className="md-pill md-pri" onClick={() => setEdit(r.med)} aria-label={`I bought more ${r.name}`}>I bought more</button>
                </span>
              )}
            </li>
          ))}
          {todo.map((m) => (
            <li key={m.clientId ?? m.name} className="row rf-row">
              <span className="grow"><b>{[m.name, m.strength].filter(Boolean).join(' ')}</b><span className="sub">Not counted yet</span></span>
              {canEdit && <button type="button" className="md-pill md-pri" onClick={() => setEdit(m)} aria-label={`Set stock for ${m.name}`}>Set stock</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="sub rf-foot">Counts go down each day by the doses a day.{asNeeded.length > 0 ? ` ${asNeeded.join(', ')} ${asNeeded.length === 1 ? 'is' : 'are'} taken as needed, so not counted.` : ''}</p>
      {edit && <StockSheet med={edit} onClose={() => setEdit(null)} />}
    </>
  )
}
