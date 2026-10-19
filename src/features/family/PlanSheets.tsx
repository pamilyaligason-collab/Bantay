import { useState } from 'react'
import { dayKey, eventDay, removeEvent, saveEvent, toEvent } from './events'
import { addNote, removeNote, saveNote } from './notes'
import Sheet from './Sheet'
import type { FamilyPerson } from './roster'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'
import { addTask, removeTask, saveTask } from './tasks'

const SAVE_FAIL = 'Could not save on this phone. Try again.'
const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

function WhoSelect({ id, value, onChange, people, all }: { id: string; value: string; onChange(v: string): void; people: FamilyPerson[]; all: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.isMe ? `${p.name} (me)` : p.name}</option>)}
    </select>
  )
}

type Item = { kind: 'task'; item?: FamilyTask } | { kind: 'event'; item?: FamilyEvent }

/** Add or edit a task or an event. A new item can switch between the two; an existing one cannot. */
export function ItemSheet({ start, day, people, onClose }: { start: Item; day: string; people: FamilyPerson[]; onClose(): void }) {
  const editing = !!start.item
  const [kind, setKind] = useState(start.kind)
  const t = start.kind === 'task' ? start.item : undefined
  const e = start.kind === 'event' ? start.item : undefined
  const [title, setTitle] = useState(t?.title ?? e?.title ?? '')
  const [due, setDue] = useState(t?.due ?? '')
  const [who, setWho] = useState(t?.assigneePersonId ?? e?.personId ?? '')
  const [date, setDate] = useState(e ? eventDay(e) : day)
  const [allDay, setAllDay] = useState(e?.allDay ?? false)
  const [time, setTime] = useState(e && !e.allDay ? hhmm(e.startsAt) : '09:00')
  const [endTime, setEndTime] = useState(e?.endsAt ? hhmm(e.endsAt) : '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await fn(); onClose() } catch { setErr(SAVE_FAIL); setBusy(false) }
  }
  const save = () => {
    if (!title.trim()) return setErr('Type a name first.')
    if (kind === 'task') return void run(() => (t ? saveTask({ ...t, title, due: due || null, assigneePersonId: who || null }) : addTask({ title, due: due || null, assigneePersonId: who || null })))
    const next = toEvent({ title, date, time, allDay, endTime, personId: who }, e?.clientId)
    if (!next) return setErr('Pick a day for it.')
    void run(() => saveEvent(e ? { ...next, id: e.id } : next))
  }
  const del = () => void run(() => (t ? removeTask(t) : removeEvent(e!)))

  return (
    <Sheet title={editing ? (kind === 'task' ? 'Edit task' : 'Edit event') : 'Add to the plan'} onClose={onClose}>
      {!editing && (
        <div className="seg" role="group" aria-label="What to add">
          <button type="button" aria-pressed={kind === 'event'} onClick={() => setKind('event')}>Event</button>
          <button type="button" aria-pressed={kind === 'task'} onClick={() => setKind('task')}>Task</button>
        </div>
      )}
      <div className="fm-form">
        <label htmlFor="fm-title">{kind === 'task' ? 'What needs doing?' : 'What is happening?'}</label>
        <input id="fm-title" value={title} maxLength={200} onChange={(ev) => { setTitle(ev.target.value); setErr('') }} placeholder={kind === 'task' ? 'Buy maintenance medicines' : 'Family dinner'} />
        {kind === 'task' ? (
          <>
            <label htmlFor="fm-due">Due date (optional)</label>
            <input id="fm-due" type="date" value={due} onChange={(ev) => setDue(ev.target.value)} />
            <label htmlFor="fm-who">Who does it?</label>
            <WhoSelect id="fm-who" value={who} onChange={setWho} people={people} all="Everyone" />
          </>
        ) : (
          <>
            <label htmlFor="fm-date">Day</label>
            <input id="fm-date" type="date" value={date} onChange={(ev) => { setDate(ev.target.value); setErr('') }} />
            <label className="fm-check"><input type="checkbox" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} /> All day</label>
            {!allDay && (
              <div className="fm-two">
                <div><label htmlFor="fm-time">Starts</label><input id="fm-time" type="time" value={time} onChange={(ev) => setTime(ev.target.value)} /></div>
                <div><label htmlFor="fm-end">Ends (optional)</label><input id="fm-end" type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} /></div>
              </div>
            )}
            <label htmlFor="fm-who">Who is it for?</label>
            <WhoSelect id="fm-who" value={who} onChange={setWho} people={people} all="Whole family" />
          </>
        )}
      </div>
      {err && <p className="fm-err" role="alert">{err}</p>}
      <button type="button" className="pill primary block" onClick={save} disabled={busy}>Save</button>
      {editing && <button type="button" className="pill ghost block fm-del" onClick={del} disabled={busy}>Delete</button>}
    </Sheet>
  )
}

/** Add or edit a note. */
export function NoteSheet({ note, onClose }: { note?: FamilyNote; onClose(): void }) {
  const [body, setBody] = useState(note?.body ?? '')
  const [pinned, setPinned] = useState(note?.pinned ?? false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await fn(); onClose() } catch { setErr(SAVE_FAIL); setBusy(false) }
  }
  const save = () => {
    if (!body.trim()) return setErr('Type the note first.')
    void run(() => (note ? saveNote({ ...note, body, pinned }) : addNote({ body, pinned })))
  }
  return (
    <Sheet title={note ? 'Edit note' : 'New note'} onClose={onClose}>
      <div className="fm-form">
        <label htmlFor="fm-body">Note for the family</label>
        <textarea id="fm-body" rows={5} value={body} maxLength={4000} onChange={(ev) => { setBody(ev.target.value); setErr('') }} placeholder="Wi-Fi password, gate code, shopping list" />
        <label className="fm-check"><input type="checkbox" checked={pinned} onChange={(ev) => setPinned(ev.target.checked)} /> Pin it to the top</label>
      </div>
      {err && <p className="fm-err" role="alert">{err}</p>}
      <button type="button" className="pill primary block" onClick={save} disabled={busy}>Save</button>
      {note && <button type="button" className="pill ghost block fm-del" onClick={() => void run(() => removeNote(note))} disabled={busy}>Delete</button>}
    </Sheet>
  )
}

export const today = () => dayKey(new Date())
