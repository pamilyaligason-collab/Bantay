import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from '../location/useLocation'
import { logActivity, logMedTaken, logReading } from '../log/store'
import { hdb } from '../records/store'
import { ask } from './client'
import { DEFAULT_CAP, takeMessage } from './cap'
import { confirmDraft, FIELDS, personFor, sourceLink, validateDraft, type Card, type DraftTool, type Msg, type People } from './tools'
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
  const loc = useLocation()
  const [s, setS] = useState('Checking the weather...')
  useEffect(() => { weatherSummary(loc).then(setS, () => setS('I could not load the weather. Check the Today screen.')) }, [loc])
  return <div className="as-card" role="status"><strong>Weather near you</strong><span>{s}</span><span className="sub">Source: Open-Meteo.com. For warnings, follow PAGASA.</span></div>
}

function CardView({ card, people, go }: { card: Card; people: People[]; go: (t: string) => void }) {
  if (card.kind === 'draft') return <DraftCard card={card} people={people} />
  if (card.kind === 'weather') return <Weather />
  if (card.kind === 'open') return <div className="as-card"><button className="btn2" onClick={() => go(card.tab)}>Open {card.tab[0]!.toUpperCase() + card.tab.slice(1)}</button></div>
  const src = sourceLink(card.source, card.term)
  return (
    <div className="as-card"><strong>{card.term}</strong><span>{card.answer}</span>
      <a href={src.url} target="_blank" rel="noopener noreferrer">{src.label}</a>
      <span className="sub">General information, not medical advice.</span></div>
  )
}

export default function Assistant() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<People[]>([])
  const btn = useRef<HTMLButtonElement>(null)
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
    const b = btn.current
    return () => { window.removeEventListener('popstate', pop); b?.focus() }
  }, [open])
  useEffect(() => { list.current?.scrollTo?.({ top: list.current.scrollHeight }) }, [items])

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

  const send = async () => {
    const content = text.trim()
    if (!content || busy) return
    setText('')
    if (!(await takeMessage(CAP))) return setItems((i) => [...i, { role: 'user', content }, { role: 'assistant', content: ERR.limit, local: true }])
    const next: Item[] = [...items, { role: 'user', content }]
    setItems(next)
    setBusy(true)
    const r = await ask(next.filter((m) => !m.local), location.hash.slice(1) || 'today')
    setBusy(false)
    setItems([...next, 'error' in r ? { role: 'assistant', content: ERR[r.error], local: true } : { role: 'assistant', content: r.text || (r.cards.length ? 'Here is what I found.' : 'I am not sure. Please ask your doctor.'), cards: r.cards }])
  }

  return (
    <>
      <button ref={btn} className="glass as-fab" aria-label="Ask Bantay" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
      </button>
      {open && (
        <div className="as-back" onClick={close}>
          <div ref={dlg} className="glass as-sheet" role="dialog" aria-modal="true" aria-labelledby="as-title" onKeyDown={onKey} onClick={(e) => e.stopPropagation()}>
            <div className="as-head">
              <h2 id="as-title">Ask Bantay</h2>
              <button className="btn2 as-x" onClick={close}>Close</button>
            </div>
            <p className="sub as-note">I can mix things up. I cannot diagnose. For an emergency call 911 or your doctor.</p>
            <div className="as-list" ref={list} aria-live="polite" aria-relevant="additions" role="log" aria-label="Conversation">
              {items.length === 0 && <p className="sub">Try: "I took my losartan" or "What is HbA1c?"</p>}
              {items.map((m, i) => (
                <div key={i} className={`as-msg ${m.role}`}>
                  <p>{m.content}</p>
                  {m.cards?.map((c) => <CardView key={c.id} card={c} people={people} go={go} />)}
                </div>
              ))}
              {busy && <p className="sub" role="status">Thinking...</p>}
            </div>
            <form className="as-form" onSubmit={(e) => { e.preventDefault(); void send() }}>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" placeholder="Ask or log something" maxLength={500} autoComplete="off" />
              <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
