import { useEffect, useState } from 'react'
import { db } from '../../db'
import { PersonChips } from '../records/PersonChips'
import { SubHeader } from '../shell/SubHeader'
import { useHealthPerson } from './useHealthPerson'
import { useVisits } from './useVisits'
import { bringList, monthDay, type Visit } from './visitsLogic'
import './health.css'
import './m7a.css'

const NO_DRAFTS: Record<string, number> = {}
const kvGet = async <T,>(key: string, fallback: T): Promise<T> => { try { return ((await db.kv.get(key))?.value as T | undefined) ?? fallback } catch { return fallback } }
const kvPut = (key: string, value: unknown) => { void db.kv.put({ key, value }).catch(() => undefined) }

function VisitRow({ v }: { v: Visit }) {
  const d = monthDay(v.day)
  return (
    <li className="row vs-row">
      <span className="vs-date" aria-hidden="true"><small>{d.mon}</small><b>{d.num}</b></span>
      <span className="grow"><b>{v.title}</b><span className="sub">{v.sub}</span></span>
    </li>
  )
}

/** #health/visits: the next visit, what to bring, the one-page summary for the doctor, follow-ups due and past visits.
 *  Visits and follow-ups are read from the server; nothing is written back (add a visit in Plan for now). */
export default function Visits() {
  const { people, ownId, personId, setPersonId, readings } = useHealthPerson()
  const list = useVisits(personId)
  const [ticked, setTicked] = useState<string[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const tickKey = `visits.bring.${personId}`
  const qKey = `visits.questions.${personId}`
  useEffect(() => {
    if (!personId) return
    let live = true
    void Promise.all([kvGet<string[]>(tickKey, []), kvGet<string[]>(qKey, [])]).then(([t, q]) => { if (live) { setTicked(t); setQuestions(q) } })
    return () => { live = false }
  }, [personId, tickKey, qKey])
  const since = Date.now() - 30 * 86_400_000
  const hasReadings = readings.some((r) => Date.parse(r.takenAt) >= since && /^(bp_|fasting_glucose)/.test(r.test))
  const items = bringList({ hasReadings, questions })
  const toggle = (id: string) => { const n = ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]; setTicked(n); kvPut(tickKey, n) }
  const addQuestion = () => {
    const q = draft.trim().slice(0, 120)
    if (!q) return
    const n = [...questions, q]
    setQuestions(n); kvPut(qKey, n); setDraft('')
  }
  const next = list.next
  const nd = next ? monthDay(next.day) : null

  return (
    <>
      <SubHeader title="Doctor visits" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />

      {next && nd ? (
        <section className="card vs-next" aria-label="Next visit" data-testid="next-visit">
          <span className="vs-date big" aria-hidden="true"><small>{nd.mon}</small><b>{nd.num}</b></span>
          <span className="grow"><b>{next.title}</b><span className="sub">{next.sub}</span></span>
        </section>
      ) : (
        <div className="card rf-hero" data-testid="no-visit"><b>No visit booked</b><span className="sub">Visits from your doctor&apos;s papers show here. You can still prepare a summary any time.</span></div>
      )}

      {list.followUps.length > 0 && (
        <section aria-labelledby="vs-fu" data-testid="follow-ups">
          <h2 className="hd" id="vs-fu">Follow-ups</h2>
          <ul className="grp">{list.followUps.map((v) => <VisitRow key={v.key} v={v} />)}</ul>
        </section>
      )}

      <section aria-labelledby="vs-bring">
        <h2 className="hd" id="vs-bring">Bring</h2>
        <ul className="grp vs-bring">
          {items.map((b) => (
            <li key={b.id} className="row">
              <button type="button" className="fm-chk" role="checkbox" aria-checked={ticked.includes(b.id)} aria-label={b.label} onClick={() => toggle(b.id)} />
              <span className={`grow${ticked.includes(b.id) ? ' vs-done' : ''}`} aria-hidden="true">{b.label}</span>
            </li>
          ))}
        </ul>
        <div className="vs-q">
          <label htmlFor="vs-qin" className="sub">A question for the doctor</label>
          <span className="vs-qrow">
            <input id="vs-qin" value={draft} maxLength={120} autoComplete="off" placeholder="Is my sugar high enough to change the dose?" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuestion()} />
            <button type="button" className="btn2 wz-sm" onClick={addQuestion}>Add</button>
          </span>
        </div>
      </section>

      <a className="btn vs-prep" href="#health/summary">Prepare visit summary</a>

      {list.upcoming.length > 1 && (
        <section aria-labelledby="vs-up">
          <h2 className="hd" id="vs-up">Coming up</h2>
          <ul className="grp">{list.upcoming.slice(1).map((v) => <VisitRow key={v.key} v={v} />)}</ul>
        </section>
      )}
      {list.past.length > 0 && (
        <section aria-labelledby="vs-past">
          <h2 className="hd" id="vs-past">Past visits</h2>
          <ul className="grp">{list.past.map((v) => <VisitRow key={v.key} v={v} />)}</ul>
        </section>
      )}
    </>
  )
}
