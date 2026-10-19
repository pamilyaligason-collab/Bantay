import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { usePlace } from '../location/useLocation'
import { track } from '../admin/events'
import { logActivity, logMedTaken, logReading } from '../log/store'
import { GUIDE } from '../health/ranges'
import { hdb } from '../records/store'
import { ask } from './client'
import { DEFAULT_CAP, takeMessage } from './cap'
import { addTask } from '../family/tasks'
import { confirmDraft, confirmTask, FIELDS, dateWords, personFor, recordsAnswer, sourceLink, taskArgs, validateDraft, type Card, type DraftTool, type Msg, type People, type RecordsAnswer } from './tools'
import { speechCtor, type RecCtor } from './speech'
import { weatherSummary } from './weather'
import './assistant.css'

const CAP = Number(import.meta.env.VITE_ASSISTANT_DAILY_CAP) || DEFAULT_CAP
const API = { logReading, logMedTaken, logActivity }
const TITLE: Record<DraftTool, string> = { log_reading: 'Log a reading', log_med_taken: 'Log a medicine taken', log_activity: 'Log an activity' }
const LABEL: Record<string, string> = { person: 'Who', test: 'Test', value: 'Value', unit: 'Unit', takenAt: 'When', name: 'Medicine', kind: 'Activity', minutes: 'Minutes', steps: 'Steps', startedAt: 'When' }
const ERR = {
  unconfigured: 'The assistant is not set up on this phone yet.',
  signin: 'Please sign in again, then ask me once more.',
  limit: 'You have used all of today\'s questions. Please try again tomorrow. For anything urgent, call your doctor, or 911.',
  failed: 'I could not reach the assistant. Please try again in a moment.'
}

type Item = Msg & { local?: boolean; cards?: Card[] }

function DraftCard({ card, people }: { card: Extract<Card, { kind: 'draft' }>; people: People[] }) {
  const [f, setF] = useState(card.fields)
  const [edit, setEdit] = useState(false)
  const [state, setState] = useState<'draft' | 'saving' | 'saved' | 'discarded'>('draft')
  const [err, setErr] = useState('')
  const who = personFor(f.person ?? '', people)
  const shown = FIELDS[card.tool].filter((k) => k !== 'person')
  const confirm = async () => {
    const bad = validateDraft(card.tool, f, people)
    if (bad) return setErr(bad)
    setState('saving') // blocks a second tap while the first save runs
    try {
      await confirmDraft(card.tool, f, people, API)
      setState('saved')
    } catch {
      setErr('Could not save. Please try again.')
      setState('draft')
    }
  }
  if (state === 'discarded') return <div className="as-card sub">Discarded.</div>
  if (state === 'saved') return <div className="as-card" role="status">Saved for {who?.name}.</div>
  return (
    <div className="as-card" role="group" aria-label={`Draft: ${TITLE[card.tool]}`}>
      <strong>{TITLE[card.tool]}</strong>
      <span className="sub">Draft only. Nothing is saved until you confirm.</span>
      <div className="as-fields">
        <label>{LABEL.person}
          {edit || (!who && people.length > 0) ? (
            <select value={who?.id ?? ''} onChange={(e) => setF({ ...f, person: e.target.value })}>{!who && <option value="">Pick who</option>}{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          ) : <b>{who?.name ?? (people.length ? 'Pick who' : 'Add a family member first')}</b>}
        </label>
        {shown.map((k) => (
          <label key={k}>{LABEL[k]}
            {edit ? <input value={f[k] ?? ''} inputMode={k === 'value' || k === 'minutes' || k === 'steps' ? 'decimal' : 'text'} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <b>{f[k] || 'Not given'}</b>}
          </label>
        ))}
      </div>
      {err && <span role="alert" className="as-err">{err}</span>}
      <div className="as-actions">
        <button className="btn" disabled={state === 'saving' || !who} onClick={confirm}>Confirm</button>
        <button className="btn2" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</button>
        <button className="btn2" onClick={() => setState('discarded')}>Discard</button>
      </div>
    </div>
  )
}

function Weather() {
  const w = usePlace()?.weather
  const [s, setS] = useState('Checking the weather...')
  useEffect(() => {
    if (!w) return
    weatherSummary(w).then(setS, () => setS('I could not load the weather. Check the Today screen.'))
  }, [w?.lat, w?.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="as-card" role="status"><strong>Weather near you</strong><span>{s}</span><span className="sub">Source: Open-Meteo.com. For warnings, follow PAGASA.</span></div>
}

function TaskCard({ card, people }: { card: Extract<Card, { kind: 'task' }>; people: People[] }) {
  const [state, setState] = useState<'draft' | 'saving' | 'saved' | 'discarded'>('draft')
  const [err, setErr] = useState('')
  const a = taskArgs(card.title, card.due, card.assignee, people)
  const who = a?.assigneePersonId ? people.find((p) => p.id === a.assigneePersonId)?.name : undefined
  const confirm = async () => {
    setState('saving') // blocks a second tap while the first save runs
    try { await confirmTask(card.title, card.due, card.assignee, people, addTask); setState('saved') } catch { setErr('Could not save the task. Please try again.'); setState('draft') }
  }
  if (state === 'discarded') return <div className="as-card sub">Discarded.</div>
  if (state === 'saved') return <div className="as-card" role="status">Task added: {a?.title}.</div>
  return (
    <div className="as-card" role="group" aria-label="Draft: Add a task">
      <strong>Add a task</strong>
      <span className="sub">Draft only. Nothing is saved until you confirm.</span>
      <div className="as-fields">
        <label>Task<b>{a?.title ?? 'Not given'}</b></label>
        <label>Due<b>{a?.due ? dateWords(a.due) : 'No date'}</b></label>
        <label>For<b>{who ?? 'Whole family'}</b></label>
      </div>
      {err && <span role="alert" className="as-err">{err}</span>}
      <div className="as-actions">
        <button className="btn" disabled={state === 'saving' || !a} onClick={confirm}>Confirm</button>
        <button className="btn2" onClick={() => setState('discarded')}>Discard</button>
      </div>
    </div>
  )
}

/** Answers from this phone's saved readings. No server call, no diagnosis. */
function RecordsCard({ card, people }: { card: Extract<Card, { kind: 'records' }>; people: People[] }) {
  const [ans, setAns] = useState<RecordsAnswer | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const who = people.find((p) => p.id === picked) ?? personFor(card.person, people) ?? (people.length === 1 ? people[0] : undefined)
  useEffect(() => {
    if (!who) return
    void (async () => {
      try {
        const [rs, th] = await Promise.all([hdb.readings.where('personId').equals(who.id).toArray(), hdb.thresholds.toArray()])
        const key = Object.keys(GUIDE).find((k) => k === card.test || GUIDE[k]!.label.toLowerCase() === card.test.toLowerCase()) ?? card.test
        setAns(recordsAnswer(rs, who.name, card.test, th.find((t) => t.key === `${who.id}:${key}`)))
      } catch { setAns({ text: 'I could not read the saved results on this phone.', cite: '' }) }
    })()
  }, [who?.id, card.test]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="as-card" role="status">
      <strong>From your records</strong>
      <span>{!who ? 'Whose result do you mean?' : ans ? ans.text : 'Looking...'}</span>
      {!who && <div className="as-people" role="group" aria-label="Pick a person">{people.map((p) => <button key={p.id} type="button" className="as-chip" onClick={() => setPicked(p.id)}>{p.name}</button>)}</div>}
      {ans?.cite && <div className="as-src"><span className="sub">Sources</span><span className="as-chip as-chip-static">{ans.cite}</span></div>}
      {ans && <span className="sub">Not sure? Ask the doctor.</span>}
    </div>
  )
}

function CardView({ card, people, go }: { card: Card; people: People[]; go: (t: string) => void }) {
  if (card.kind === 'draft') return <DraftCard card={card} people={people} />
  if (card.kind === 'task') return <TaskCard card={card} people={people} />
  if (card.kind === 'records') return <RecordsCard card={card} people={people} />
  if (card.kind === 'weather') return <Weather />
  if (card.kind === 'open') return <div className="as-card"><button className="btn2" onClick={() => go(card.tab)}>Open {card.tab[0]!.toUpperCase() + card.tab.slice(1)}</button></div>
  const src = sourceLink(card.source, card.term)
  return (
    <div className="as-card"><strong>{card.term}</strong><span>{card.answer}</span>
      <div className="as-src"><span className="sub">Sources</span><a className="as-chip" href={src.url} target="_blank" rel="noopener noreferrer">{src.label}</a></div>
      <span className="sub">Not sure? Ask the doctor. General information, not medical advice.</span></div>
  )
}

export const ASK_EVENT = 'bantay:ask'
// A chip with send:true asks right away; the others fill the box so the person can add the numbers.
export const CHIPS = [
  { label: 'Log my BP', text: 'Log my blood pressure: ', send: false },
  { label: 'Did I take my medicine?', text: 'Did I take my medicine today?', send: true },
  { label: 'What does HbA1c mean?', text: 'What does HbA1c mean?', send: true },
  { label: 'Add a task', text: 'Add a task: ', send: false }
]

export default function Assistant() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<People[]>([])
  const opener = useRef<HTMLElement | null>(null)
  const dlg = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // Back (gesture or button) closes the sheet instead of leaving the app.
  useEffect(() => {
    if (!open) return
    history.pushState({ bantayAssistant: 1 }, '')
    const pop = () => setOpen(false)
    window.addEventListener('popstate', pop)
    hdb.people.toArray().then(setPeople, () => setPeople([]))
    input.current?.focus()
    const b = opener.current
    return () => { window.removeEventListener('popstate', pop); b?.focus() }
  }, [open])
  // The centre tab in the nav bar fires this; the sheet itself lives here.
  useEffect(() => {
    const on = () => { const a = document.activeElement as HTMLElement | null; opener.current = a === document.body ? document.querySelector<HTMLElement>('.tab-ask') : a; setOpen(true) }
    window.addEventListener(ASK_EVENT, on)
    return () => window.removeEventListener(ASK_EVENT, on)
  }, [])
  // A card starts at the top of the list so Confirm and Discard are in view; plain replies scroll to the end.
  useEffect(() => {
    const l = list.current
    const last = items[items.length - 1]
    const el = l?.querySelector<HTMLElement>('.as-msg:last-of-type')
    l?.scrollTo?.({ top: last?.cards?.length && el ? el.offsetTop - l.offsetTop : (l?.scrollHeight ?? 0) })
  }, [items])

  const close = () => (history.state?.bantayAssistant ? history.back() : setOpen(false))
  const go = (tab: string) => { history.replaceState(null, ''); setOpen(false); location.hash = tab }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close()
    if (e.key !== 'Tab' || !dlg.current) return
    const els = Array.from(dlg.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href]'))
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }

  const Mic = useRef<RecCtor | null | undefined>(undefined)
  if (Mic.current === undefined) Mic.current = speechCtor()
  const rec = useRef<InstanceType<RecCtor> | null>(null)
  const [listening, setListening] = useState(false)
  useEffect(() => { if (!open) { rec.current?.stop(); setListening(false) } }, [open])
  const listen = () => {
    if (rec.current && listening) return rec.current.stop()
    const R = Mic.current
    if (!R) return
    const r = new R()
    r.lang = 'en-PH'
    r.interimResults = false
    r.onresult = (e) => setText(Array.from(e.results, (x) => x[0]?.transcript ?? '').join(' ').trim().slice(0, 500))
    r.onend = r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const send = async (override?: string) => {
    const content = (override ?? text).trim()
    if (!content || busy) return
    setText('')
    if (!(await takeMessage(CAP))) return setItems((i) => [...i, { role: 'user', content }, { role: 'assistant', content: ERR.limit, local: true }])
    const next: Item[] = [...items, { role: 'user', content }]
    setItems(next)
    setBusy(true)
    const r = await ask(next.filter((m) => !m.local), location.hash.slice(1) || 'today')
    setBusy(false)
    if ('error' in r && r.error === 'failed') void track('error', 'assistant_failed')
    setItems([...next, 'error' in r ? { role: 'assistant', content: ERR[r.error], local: true } : { role: 'assistant', content: r.text || (r.cards.length ? '' : 'I am not sure. Please ask your doctor.'), cards: r.cards }])
  }

  return (
    <>
      {open && (
        <div className="as-back" onClick={close}>
          <div ref={dlg} className="glass as-sheet" role="dialog" aria-modal="true" aria-labelledby="as-title" onKeyDown={onKey} onClick={(e) => e.stopPropagation()}>
            <div className="as-head">
              <h2 id="as-title">Ask Bantay</h2>
              <button type="button" className="as-x" onClick={close} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <p className="sub as-note">I can mix things up. I cannot diagnose. For an emergency call 911 or your doctor.</p>
            <div className="as-list" ref={list} aria-live="polite" aria-relevant="additions" role="log" aria-label="Conversation">
              {items.length === 0 && <p className="sub">Try: "I took my losartan" or "What is HbA1c?"</p>}
              {items.map((m, i) => (
                <div key={i} className={`as-msg ${m.role}`}>
                  {m.content && <p>{m.content}</p>}
                  {m.cards?.map((c) => <CardView key={c.id} card={c} people={people} go={go} />)}
                </div>
              ))}
              {busy && <p className="sub" role="status">Thinking...</p>}
            </div>
            {items.length === 0 && <div className="as-chips" role="group" aria-label="Suggestions">
              {CHIPS.map((c) => (
                <button key={c.label} type="button" className="as-chip" disabled={busy && c.send} onClick={() => (c.send ? void send(c.text) : (setText(c.text), input.current?.focus()))}>{c.label}</button>
              ))}
            </div>}
            <form className="as-form" onSubmit={(e) => { e.preventDefault(); void send() }}>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" placeholder="Ask or log something" maxLength={500} autoComplete="off" />
              {Mic.current && (
                <button type="button" className="as-mic" aria-label={listening ? 'Stop listening' : 'Speak'} aria-pressed={listening} onClick={listen}>
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
                </button>
              )}
              <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
