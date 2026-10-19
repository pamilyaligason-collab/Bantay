import { useState } from 'react'
import { addEvent, dayKey, eventDay, removeEvent, saveEvent, toEvent } from './events'
import { addNote, removeNote, saveNote } from './notes'
import { pickDay, repeatDays, type Repeat, type WhenPick } from './planList'
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

const PICKS: [WhenPick, string][] = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'This weekend'], ['date', 'Pick date']]
const REPEATS: [Repeat, string][] = [['none', 'No repeat'], ['daily', 'Every day'], ['weekly', 'Every week']]

/** The quick pick that matches a saved day, else "Pick date" (or "No date" when there is none). */
function pickFor(day: string, now: Date): WhenPick {
  if (!day) return 'none'
  return (['today', 'tomorrow', 'weekend'] as const).find((p) => pickDay(p, now) === day) ?? 'date'
}

/** Add or edit a reminder (task) or an event: what, who, when (quick picks), repeat. A new one can switch between reminder, event and note; an existing one cannot. */
export function ItemSheet({ start, day, people, onClose, onNote }: { start: Item; day: string; people: FamilyPerson[]; onClose(): void; onNote?(): void }) {
  const editing = !!start.item
  const now = new Date()
  const [kind, setKind] = useState(start.kind)
  const t = start.kind === 'task' ? start.item : undefined
  const e = start.kind === 'event' ? start.item : undefined
  const [title, setTitle] = useState(t?.title ?? e?.title ?? '')
  const [who, setWho] = useState(t?.assigneePersonId ?? e?.personId ?? '')
  const [date, setDate] = useState(e ? eventDay(e) : t ? (t.due ?? '') : day)
  const [pick, setPick] = useState<WhenPick>(editing ? pickFor(date, now) : pickFor(day, now))
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [allDay, setAllDay] = useState(e?.allDay ?? false)
  const [time, setTime] = useState(e && !e.allDay ? hhmm(e.startsAt) : '09:00')
  const [endTime, setEndTime] = useState(e?.endsAt ? hhmm(e.endsAt) : '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const choose = (p: WhenPick) => { setPick(p); setErr(''); setDate(p === 'date' ? date || dayKey(now) : (pickDay(p, now) ?? '')) }
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await fn(); onClose() } catch { setErr(SAVE_FAIL); setBusy(false) }
  }
  const save = () => {
    if (!title.trim()) return setErr('Type a name first.')
    if (kind === 'task') {
      const due = pick === 'none' ? null : date || null
      if (pick !== 'none' && !due) return setErr('Pick a day for it.')
      if (t) return void run(() => saveTask({ ...t, title, due, assigneePersonId: who || null }))
      const days = due ? repeatDays(due, repeat) : [null]
      return void run(async () => { for (const d of days) await addTask({ title, due: d, assigneePersonId: who || null }) })
    }
    const next = toEvent({ title, date, time, allDay, endTime, personId: who }, e?.clientId)
    if (!next) return setErr('Pick a day for it.')
    if (e) return void run(() => saveEvent({ ...next, id: e.id }))
    void run(async () => { for (const d of repeatDays(date, repeat)) await addEvent({ title, date: d, time, allDay, endTime, personId: who }) })
  }
  const del = () => void run(() => (t ? removeTask(t) : removeEvent(e!)))

  return (
    <Sheet title={editing ? (kind === 'task' ? 'Edit reminder' : 'Edit event') : 'Add to the plan'} onClose={onClose}>
      {!editing && (
        <div className="seg fm-kind" role="group" aria-label="What to add">
          <button type="button" aria-pressed={kind === 'task'} onClick={() => setKind('task')}>Reminder</button>
          <button type="button" aria-pressed={kind === 'event'} onClick={() => setKind('event')}>Event</button>
          {onNote && <button type="button" onClick={onNote}>Note</button>}
        </div>
      )}
      <div className="fm-form">
        <label htmlFor="fm-title">{kind === 'task' ? 'What needs doing?' : 'What is happening?'}</label>
        <input id="fm-title" value={title} maxLength={200} onChange={(ev) => { setTitle(ev.target.value); setErr('') }} placeholder={kind === 'task' ? "Lola's check-up" : 'Family dinner'} />
        <label htmlFor="fm-who">{kind === 'task' ? 'Who does it?' : 'Who is it for?'}</label>
        <WhoSelect id="fm-who" value={who} onChange={setWho} people={people} all={kind === 'task' ? 'Everyone' : 'Whole family'} />
        <span className="fm-lbl" id="fm-when-l">When?</span>
        <div className="fm-chips" role="group" aria-labelledby="fm-when-l">
          {PICKS.map(([p, label]) => <button type="button" key={p} aria-pressed={pick === p} onClick={() => choose(p)}>{label}</button>)}
          {kind === 'task' && <button type="button" aria-pressed={pick === 'none'} onClick={() => choose('none')}>No date</button>}
        </div>
        {pick === 'date' && <input id="fm-date" type="date" aria-label="Day" value={date} onChange={(ev) => { setDate(ev.target.value); setErr('') }} />}
        {kind === 'event' && (
          <>
            <label className="fm-check"><input type="checkbox" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} /> All day</label>
            {!allDay && (
              <div className="fm-two">
                <div><label htmlFor="fm-time">Starts</label><input id="fm-time" type="time" value={time} onChange={(ev) => setTime(ev.target.value)} /></div>
                <div><label htmlFor="fm-end">Ends (optional)</label><input id="fm-end" type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} /></div>
              </div>
            )}
          </>
        )}
        {!editing && (kind === 'event' || pick !== 'none') && (
          <>
            <span className="fm-lbl" id="fm-rep-l">Repeat</span>
            <div className="fm-chips" role="group" aria-labelledby="fm-rep-l">
              {REPEATS.map(([r, label]) => <button type="button" key={r} aria-pressed={repeat === r} onClick={() => setRepeat(r)}>{label}</button>)}
            </div>
            {repeat !== 'none' && <p className="sub fm-hint">{repeat === 'daily' ? 'Adds the next 14 days.' : 'Adds the next 8 weeks.'}</p>}
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
