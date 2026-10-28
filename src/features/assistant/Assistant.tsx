import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { usePlace } from '../location/useLocation'
import { track } from '../admin/events'
import { logActivity, logMedTaken, logReading } from '../log/store'
import { GUIDE } from '../health/ranges'
import { hdb } from '../records/store'
import { ask } from './client'
import { DEFAULT_CAP, takeMessage } from './cap'
import { addTask } from '../family/tasks'
import { cardScrollTop, confirmDraft, confirmTask, FIELDS, personChoices, dateWords, personFor, recordsAnswer, sourceLink, taskArgs, validateDraft, type Card, type DraftTool, type Msg, type People, type RecordsAnswer } from './tools'
import { speechCtor, type RecCtor } from './speech'
import { Icon } from '../shell/Icon'
import { JackArt } from '../look'
import { openScan } from '../scan/open'
import { weatherSummary } from './weather'
import { CAUTION, clearHistory, loadHistory, saveHistory, trimHistory, useKeyboardInset } from './history'
import { localGate, type Emergency } from './gateClient'
import { EmergencyCard } from './EmergencyCard'
import { OfflinePanel } from './OfflinePanel'
import SosScreen from '../sos/SosScreen'
import { startSos, SOS_CONTACTS_KEY } from '../sos/active'
import { normalizeContacts } from '../sos/contacts'
import { loadFamily } from '../auth/family'
import { useKv } from '../shell/useKv'
import { AI_OFF, aiOn } from '../privacy/ai'
import './assistant.css'

const CAP = Number(import.meta.env.VITE_ASSISTANT_DAILY_CAP) || DEFAULT_CAP
const API = { logReading, logMedTaken, logActivity }
const TITLE: Record<DraftTool, string> = { log_reading: 'Log a reading', log_med_taken: 'Log a medicine taken', log_activity: 'Log an activity' }
const LABEL: Record<string, string> = { person: 'Who', test: 'Test', value: 'Value', unit: 'Unit', takenAt: 'When', name: 'Medicine', kind: 'Activity', minutes: 'Minutes', steps: 'Steps', startedAt: 'When' }
const ERR = {
  off: AI_OFF,
  unconfigured: 'The assistant is not set up on this phone yet.',
  signin: 'Please sign in again, then ask me once more.',
  limit: 'You have used all of today\'s questions. Please try again tomorrow. For anything urgent, call your doctor, or 911.',
  failed: 'I could not reach the assistant. Please try again in a moment.'
}

// local = never sent to the server; sensitive = an emergency exchange, never saved on the phone; queued = typed offline, sent when signal returns.
type Item = Msg & { local?: boolean; cards?: Card[]; emergency?: Emergency; sensitive?: boolean; queued?: boolean }
const NONE: unknown[] = []

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

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
            <select value={who?.id ?? ''} onChange={(e) => setF({ ...f, person: e.target.value })}>{!who && <option value="">Pick who</option>}{(who ? people : personChoices(f.person ?? '', people)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          ) : <b>{who?.name ?? (people.length ? 'Pick who' : 'Add a family member first')}</b>}
        </label>
        {shown.map((k) => (
          <label key={k}>{LABEL[k]}
            {edit ? <input value={f[k] ?? ''} inputMode={k === 'value' || k === 'minutes' || k === 'steps' ? 'decimal' : 'text'} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <b>{f[k] || 'Not given'}</b>}
          </label>
        ))}
      </div>
      {!who && people.length > 0 && <span className="as-hint" role="status">Pick who this is for</span>}
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
  // choice: undefined = not picked yet, '' = whole family, else a person id. A named assignee we cannot match must be picked, never dropped.
  const [choice, setChoice] = useState<string | undefined>()
  const named = card.assignee.trim() !== '' && !personFor(card.assignee, people)
  const assignee = choice !== undefined ? choice : card.assignee
  const a = taskArgs(card.title, card.due, assignee, people)
  const who = a?.assigneePersonId ? people.find((p) => p.id === a.assigneePersonId)?.name : undefined
  const needPick = named && choice === undefined
  const options = personChoices(card.assignee, people)
  const confirm = async () => {
    setState('saving') // blocks a second tap while the first save runs
    try { await confirmTask(card.title, card.due, assignee, people, addTask); setState('saved') } catch { setErr('Could not save the task. Please try again.'); setState('draft') }
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
        <label>For<b>{needPick ? `Who is "${card.assignee.trim()}"?` : who ?? 'Whole family'}</b></label>
      </div>
      {named && <div className="as-people" role="group" aria-label="Pick a person">
        {options.map((p) => <button key={p.id} type="button" className="as-chip" aria-pressed={choice === p.id} onClick={() => setChoice(p.id)}>{p.name}</button>)}
        <button type="button" className="as-chip" aria-pressed={choice === ''} onClick={() => setChoice('')}>Whole family</button>
      </div>}
      {needPick && <span className="as-hint" role="status">Pick who this is for</span>}
      {err && <span role="alert" className="as-err">{err}</span>}
      <div className="as-actions">
        <button className="btn" disabled={state === 'saving' || !a || needPick} onClick={confirm}>Confirm</button>
        <button className="btn2" onClick={() => setState('discarded')}>Discard</button>
      </div>
    </div>
  )
}

/** Answers from this phone's saved readings. No server call, no diagnosis. */
function RecordsCard({ card, people }: { card: Extract<Card, { kind: 'records' }>; people: People[] }) {
  const [ans, setAns] = useState<RecordsAnswer | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const who = people.find((p) => p.id === picked) ?? personFor(card.person, people) ?? (card.person.trim() === '' && people.length === 1 ? people[0] : undefined)
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
      {!who && <div className="as-people" role="group" aria-label="Pick a person">{personChoices(card.person, people).map((p) => <button key={p.id} type="button" className="as-chip" onClick={() => setPicked(p.id)}>{p.name}</button>)}</div>}
      {!who && <span className="as-hint" role="status">{people.length ? 'Pick who this is for' : 'Add a family member first'}</span>}
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
  const kb = useKeyboardInset(open)
  const restored = useRef(false)

  // Back (gesture or button) closes the sheet instead of leaving the app.
  useEffect(() => {
    if (!open) return
    void track('screen', 'ask')
    history.pushState({ bantayAssistant: 1 }, '')
    const pop = () => setOpen(false)
    window.addEventListener('popstate', pop)
    hdb.people.toArray().then(setPeople, () => setPeople([]))
    if (!restored.current) { // the last 20 messages come back from this phone, once per app start
      restored.current = true
      void loadHistory().then((h) => setItems((cur) => (cur.length ? cur : h)))
    }
    input.current?.focus()
    const b = opener.current
    return () => { window.removeEventListener('popstate', pop); b?.focus() }
  }, [open])
  // The floating Jack button fires this; the sheet itself lives here.
  useEffect(() => {
    const on = () => { const a = document.activeElement as HTMLElement | null; opener.current = a === document.body ? document.querySelector<HTMLElement>('.sh-jackfab') : a; setOpen(true) }
    window.addEventListener(ASK_EVENT, on)
    return () => window.removeEventListener(ASK_EVENT, on)
  }, [])
  // A card starts at the top of the list so Confirm and Discard are in view; plain replies scroll to the end.
  useEffect(() => {
    const l = list.current
    const last = items[items.length - 1]
    const place = () => {
      const el = l?.querySelector<HTMLElement>('.as-msg:last-of-type')
      l?.scrollTo?.({ top: last?.cards?.length && el ? cardScrollTop(el.offsetTop - l.offsetTop, el.offsetHeight, l.clientHeight, l.scrollHeight) : (l?.scrollHeight ?? 0) })
    }
    place()
    // The card grows after it lands (Edit, person chips, the people list loading): place it again.
    const el = l?.querySelector<HTMLElement>('.as-msg:last-of-type')
    if (!last?.cards?.length || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items, people])

  const clearChat = () => { setItems([]); void clearHistory() }
  const close = () => (history.state?.bantayAssistant ? history.back() : setOpen(false))
  const scan = () => { history.replaceState(null, ''); setOpen(false); openScan() }
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

  const online = useOnline()
  const [sos, setSos] = useState(false)
  const [rawContacts] = useKv<unknown[]>(SOS_CONTACTS_KEY, NONE)
  const contact = normalizeContacts(rawContacts, loadFamily())[0]
  const queued = items.find((m) => m.queued)?.content

  // The model path: counts one message, asks, shows the reply. Anything typed while offline waits in `queued` and comes here when signal returns.
  const deliver = async (content: string) => {
    if (!(await aiOn())) return setItems((i) => [...i.filter((m) => !m.queued), { role: 'user', content }, { role: 'assistant', content: AI_OFF, local: true }]) // privacy.ai: before the daily count is used; the local emergency gate runs before this
    if (!(await takeMessage(CAP))) return setItems((i) => [...i.filter((m) => !m.queued), { role: 'user', content }, { role: 'assistant', content: ERR.limit, local: true }])
    const next: Item[] = [...items.filter((m) => !m.queued), { role: 'user', content }]
    setItems(next)
    setBusy(true)
    const r = await ask(next.filter((m) => !m.local), location.hash.slice(1) || 'today')
    setBusy(false)
    if ('error' in r && r.error === 'failed') void track('error', 'assistant_failed')
    let done: Item[]
    if ('emergency' in r && r.emergency) { // the server gate fired: same card as the local one, and this exchange never goes back to the model or onto the phone
      done = [...next.slice(0, -1), { role: 'user', content, local: true, sensitive: true }, { role: 'assistant', content: '', local: true, sensitive: true, emergency: r.emergency }]
    } else {
      done = [...next, 'error' in r ? { role: 'assistant', content: ERR[r.error], local: true } : { role: 'assistant', content: r.text || (r.cards.length ? '' : 'I am not sure. Please ask your doctor.'), cards: r.cards }]
    }
    setItems(done)
    void saveHistory(trimHistory(done.filter((m) => !m.sensitive)))
  }
  useEffect(() => { if (online && queued && !busy) void deliver(queued) }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (override?: string) => {
    const content = (override ?? text).trim()
    if (!content || busy) return
    setText('')
    // Local gate first: before the daily cap and before any request, so it works offline and at the limit. The words stay on this phone.
    const em = await localGate(content)
    if (em) return setItems((i) => [...i.filter((m) => !m.queued), { role: 'user', content, local: true, sensitive: true }, { role: 'assistant', content: '', local: true, sensitive: true, emergency: em }])
    if (!online) return setItems((i) => [...i.filter((m) => !m.queued), { role: 'user', content, local: true, queued: true }])
    await deliver(content)
  }
  const tellFamily = () => { startSos(); setSos(true) }

  return (
    <>
      {open && (
        <div className="as-back" style={kb ? { bottom: kb } : undefined} data-kb={kb > 0 ? 'open' : undefined} onClick={close}>
          <div ref={dlg} className="glass as-sheet" role="dialog" aria-modal="true" aria-labelledby="as-title" onKeyDown={onKey} onClick={(e) => e.stopPropagation()}>
            <div className="as-head">
              <button type="button" className="as-x" onClick={close} aria-label="Back">
                <Icon name="back" size={22} />
              </button>
              <h2 id="as-title" style={{ flex: 1 }}>Ask Bantay</h2>
              {items.length > 0 && <button type="button" className="btn2 as-clear" onClick={clearChat}>Clear chat</button>}
            </div>
            <p className="sub as-note">{CAUTION} For an emergency call 911.</p>
            <div className="as-list" ref={list} aria-live="polite" aria-relevant="additions" role="log" aria-label="Conversation">
              {items.length === 0 && <p className="sub">Try: "I took my losartan" or "What is HbA1c?"</p>}
              {items.map((m, i) => (
                <div key={i} className={`as-msg ${m.role}`}>
                  {m.content && <p>{m.content}</p>}
                  {m.queued && <span className="sub as-wait" role="status">Waiting for signal</span>}
                  {m.emergency && <EmergencyCard e={m.emergency} onSos={tellFamily} />}
                  {m.cards?.map((c) => <CardView key={c.id} card={c} people={people} go={go} />)}
                </div>
              ))}
              {busy && <p className="sub s14j-row" role="status"><JackArt name="thinking" size={48} decorative />Thinking...</p>}
              {!online && <OfflinePanel contact={contact} go={go} />}
            </div>
            {items.length === 0 && <div className="as-chips" role="group" aria-label="Suggestions">
              {CHIPS.map((c) => (
                <button key={c.label} type="button" className="as-chip" disabled={busy && c.send} onClick={() => (c.send ? void send(c.text) : (setText(c.text), input.current?.focus()))}>{c.label}</button>
              ))}
              <button type="button" className="as-chip" onClick={scan}>Scan & Capture</button>
            </div>}
            <form className="as-form" onSubmit={(e) => { e.preventDefault(); void send() }}>
              <button type="button" className="as-mic as-cam" aria-label="Scan & Capture" onClick={scan}><Icon name="camera" /></button>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" placeholder={online ? 'Ask or log something' : 'Jack is waiting for signal'} maxLength={500} autoComplete="off" />
              {Mic.current && (
                <button type="button" className="as-mic" aria-label={listening ? 'Stop listening' : 'Speak'} aria-pressed={listening} onClick={listen}>
                  <Icon name="mic" active={listening} />
                </button>
              )}
              <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
            </form>
          </div>
        </div>
      )}
      {sos && <SosScreen onClose={() => setSos(false)} />}
    </>
  )
}
