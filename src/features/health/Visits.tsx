import { useEffect, useState } from 'react'
import { db } from '../../db'
import { WhoLine } from './WhoLine'
import { LargeTitle, Section } from '../look'
import { Icon } from '../shell/Icon'
import { useMedications } from './useMedications'
import { labDate } from './labsLogic'
import { useHealthPerson } from './useHealthPerson'
import { useVisits } from './useVisits'
import { bringList, monthDay, type Visit } from './visitsLogic'
import './health.css'
import './m7a.css'
import './comply.css'

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
  const { personId, readings } = useHealthPerson()
  const list = useVisits(personId)
  const [ticked, setTicked] = useState<string[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [asked, setAsked] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const tickKey = `visits.bring.${personId}`
  const qKey = `visits.questions.${personId}`
  const askedKey = `visits.asked.${personId}`
  useEffect(() => {
    if (!personId) return
    let live = true
    void Promise.all([kvGet<string[]>(tickKey, []), kvGet<string[]>(qKey, []), kvGet<string[]>(askedKey, [])]).then(([t, q, d]) => { if (live) { setTicked(t); setQuestions(q); setAsked(d) } })
    return () => { live = false }
  }, [personId, tickKey, qKey, askedKey])
  const since = Date.now() - 30 * 86_400_000
  const recent = readings.filter((r) => Date.parse(r.takenAt) >= since && /^(bp_systolic|fasting_glucose|glucose)$/.test(r.test))
  const hasReadings = recent.length > 0
  const meds = useMedications(personId)
  const paper = readings.filter((r) => r.labHigh != null || r.labLow != null).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  const items = bringList({ hasReadings, questions, readingCount: recent.length, medCount: meds.filter((m) => (m.medStatus ?? 'active') === 'active').length, paperDate: paper ? labDate(paper.takenAt, true) : null })
  const toggle = (id: string) => { const n = ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]; setTicked(n); kvPut(tickKey, n) }
  const addQuestion = () => {
    const q = draft.trim().slice(0, 120)
    if (!q) return
    const n = [...questions, q]
    setQuestions(n); kvPut(qKey, n); setDraft('')
  }
  const markAsked = (i: number) => { // asked at the visit: it moves to "Asked before" (newest 30 kept)
    const q = questions[i]!
    const n = questions.filter((_, k) => k !== i)
    const d = [q, ...asked].slice(0, 30)
    setQuestions(n); kvPut(qKey, n); setAsked(d); kvPut(askedKey, d)
  }
  const next = list.next
  const nd = next ? monthDay(next.day) : null
  const ready = questions.length > 0 ? `${questions.length} ${questions.length === 1 ? 'question' : 'questions'} ready` : null

  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Visits" tone="purple" />
      <WhoLine />

      <section className="card vs-hero" data-hero data-tint="purple" data-testid="vs-hero" aria-label="Next visit">
        {next && nd ? (
          <div data-testid="next-visit" className="vs-nextrow">
            <span className="vs-date big" aria-hidden="true"><small>{nd.mon}</small><b>{nd.num}</b></span>
            <span className="grow"><b>{next.title}</b><span className="sub">{next.sub}</span></span>
          </div>
        ) : (
          <div data-testid="no-visit" className="vs-nextrow">
            <span className="vs-ic" aria-hidden="true"><Icon name="calendar" size={24} /></span>
            <span className="grow">
              <b>No visit booked</b>
              <span className="sub">Pick a date in Plan and Bantay will remind you. Visits from your doctor&apos;s papers show here too.</span>
            </span>
          </div>
        )}
        {(ready || !next) && (
          <div className="vs-actrow">
            {!next && <a className="btn" href="#family/plan">Plan a visit</a>}
            {ready && <span className="vs-chip">{ready}</span>}
          </div>
        )}
      </section>

      <Section title="Bring to the visit" testId="vs-bring">
        <ul className="grp vs-bring">
          {items.map((b) => (
            <li key={b.id} className="row">
              <button type="button" className="fm-chk" role="checkbox" aria-checked={ticked.includes(b.id)} aria-label={b.sub ? `${b.label}. ${b.sub}` : b.label} onClick={() => toggle(b.id)} />
              <span className={`grow${ticked.includes(b.id) ? ' vs-done' : ''}`} aria-hidden="true">{b.label}{b.sub && <span className="sub vs-sub">{b.sub}</span>}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Questions to ask" testId="vs-questions">
        {questions.length > 0 && (
          <ul className="grp">
            {questions.map((q, i) => (
              <li key={`${i}${q}`} className="row"><span className="grow">{q}</span><button type="button" className="btn2 wz-sm" onClick={() => markAsked(i)} aria-label={`Asked: ${q}`}>Asked</button></li>
            ))}
          </ul>
        )}
        <div className="vs-q">
          <label htmlFor="vs-qin" className="sub">A question for the doctor</label>
          <span className="vs-qrow">
            <input id="vs-qin" value={draft} maxLength={120} autoComplete="off" placeholder="Is my sugar high enough to change the dose?" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuestion()} />
            <button type="button" className="btn2 wz-sm" onClick={addQuestion}>Add</button>
          </span>
        </div>
      </Section>

      <Section title="Asked before" testId="vs-asked">
        {asked.length > 0
          ? <ul className="grp">{asked.map((q, i) => <li key={`${i}${q}`} className="row"><span className="grow">{q}</span></li>)}</ul>
          : <p className="sub">Nothing yet. A question you mark Asked is kept here.</p>}
      </Section>

      <Section title="Summary" testId="vs-summary">
        <a className="btn vs-prep" href="#health/summary">Prepare visit summary</a>
        <div className="card vs-sumcard">
          <span className="vs-page" role="img" aria-label="Preview of the summary sheet"><i /><i /><i /><i /><i /><i /></span>
          <span className="grow"><b>One page for your doctor</b><span className="sub">Readings, medicines, labs and your questions. Share it or print it.</span></span>
        </div>
      </Section>

      {list.followUps.length > 0 && (
        <Section title="Follow-ups" testId="follow-ups">
          <ul className="grp">{list.followUps.map((v) => <VisitRow key={v.key} v={v} />)}</ul>
        </Section>
      )}

      <Section title="Coming up">
        {list.upcoming.length > 1
          ? <ul className="grp">{list.upcoming.slice(1).map((v) => <VisitRow key={v.key} v={v} />)}</ul>
          : <div className="card rf-hero"><b>Nothing booked</b><span className="sub">Planned visits and follow-ups show here.</span></div>}
      </Section>
      <Section title="Past visits">
        {list.past.length > 0
          ? <ul className="grp">{list.past.map((v) => <VisitRow key={v.key} v={v} />)}</ul>
          : <div className="card rf-hero"><b>No past visits yet</b><span className="sub">Finished visits and what you asked are kept here.</span></div>}
      </Section>
    </>
  )
}
