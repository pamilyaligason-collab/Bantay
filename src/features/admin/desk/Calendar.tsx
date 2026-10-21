import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import { when as fullTime } from '../shared'
import { deskHref, type PageProps } from './types'
import { Empty, PageHead, Panel, Skeleton, Tag, useConfirm, useToast } from './ui'
import { useDeskPeople } from './people'
import {
  APPT_STATUSES, KINDS, MONTHS, WEEKDAYS, addDays, createEvent, createTask, dayLabel, isDay, itemDay, itemsOn, loadAgenda, manilaDay, manilaTime, monthGrid, monthOf, parseTimesText,
  restoreAppointment, restoreMedSchedule, setApptStatus, setDeleted, setTaskDone, shiftMonth, timeText, todayManila, updateAppointment, updateEvent, updateMedTimes, updateTask, weekDays, writeError,
  type AgendaItem, type EventInput, type Kind, type Res, type TaskInput
} from './scheduleApi'
import './calendar.css'

const VIEWS = [['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']] as const
type View = (typeof VIEWS)[number][0]
const KIND_ONE: Record<Kind, string> = { event: 'Event', task: 'Task', appointment: 'Appointment', dose: 'Medicine time', followup: 'Follow-up', expiry: 'Expiry' }
const colour = (k: Kind) => `var(${KINDS.find((x) => x.key === k)!.color})`
const AGENDA_DAYS = 30

type Form = { t: 'event'; item?: AgendaItem; day: string } | { t: 'task'; item?: AgendaItem; day: string } | { t: 'appt'; item: AgendaItem } | { t: 'meds'; item: AgendaItem }
type PanelState = { type: 'day'; day: string } | { type: 'form'; form: Form; back: string | null } | null

const go = (day: string, view: View, replace = false) => { const h = deskHref('calendar', day, view); if (replace) window.location.replace(h); else window.location.hash = h }
const rangeOf = (anchor: string, view: View): [string, string] => {
  if (view === 'month') { const g = monthGrid(monthOf(anchor)); return [g[0], g[g.length - 1]] }
  if (view === 'week') { const w = weekDays(anchor); return [w[0], w[6]] }
  return [anchor, addDays(anchor, AGENDA_DAYS - 1)]
}
const eventInput = (i: AgendaItem): EventInput => ({ title: i.title, date: itemDay(i), allDay: i.allDay, start: i.allDay ? null : manilaTime(i.when), end: i.endsAt ? manilaTime(i.endsAt) : null, personId: i.personId })
const taskInput = (i: AgendaItem): TaskInput => ({ title: i.title, due: i.when, assigneePersonId: i.personId })

export default function Calendar({ id, sub }: PageProps) {
  const today = todayManila()
  const anchor = isDay(id) ? id : today
  const view: View = sub === 'week' || sub === 'agenda' ? sub : 'month'
  const [from, to] = rangeOf(anchor, view)
  const { people, nameOf } = useDeskPeople()
  const [data, setData] = useState<{ items: AgendaItem[]; doseCapped: boolean; doseFrom: string; partial: boolean } | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(KINDS.map((k) => k.key)))
  const [person, setPerson] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelState>(null)
  const [menu, setMenu] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let live = true
    setFailed(false)
    loadAgenda(from, to).then((r) => live && setData(r), () => live && setFailed(true))
    return () => { live = false }
  }, [from, to, tick])

  const items = useMemo(() => (data?.items ?? []).filter((i) => kinds.has(i.kind) && (!person || i.personId === person || i.personId == null)), [data, kinds, person])
  const flip = (k: Kind) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  // ---- navigation ----
  const step = view === 'month' ? (n: number) => shiftMonth(monthOf(anchor), n) + '-01' : (n: number) => addDays(anchor, n * (view === 'week' ? 7 : AGENDA_DAYS))
  const title = view === 'month' ? `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}` : view === 'week' ? `${dayLabel(from)} to ${dayLabel(to)}` : `Next ${AGENDA_DAYS} days from ${dayLabel(from)}`
  const link = (day: string, v: View = view) => deskHref('calendar', day, v)

  // ---- writes: every one reports through the toast, with Undo where it can be undone ----
  const done = async (r: Res<unknown>, text: string, undo?: () => Promise<Res<unknown>>) => {
    if (!r.ok) { toast.show(writeError(r.error)); return false }
    toast.show(text, undo ? async () => { const u = await undo(); toast.show(u.ok ? 'Undone' : writeError(u.error)); reload() } : undefined)
    reload()
    return true
  }
  const after = (back: string | null) => setPanel(back ? { type: 'day', day: back } : null)

  const tickTask = (i: AgendaItem) => void (async () => { const v = !i.done; await done(await setTaskDone(i.rowId, v), v ? 'Task done' : 'Task reopened', () => setTaskDone(i.rowId, !v)) })()

  const save = async (form: Form, back: string | null, v: Record<string, string | boolean>) => {
    const str = (k: string) => String(v[k] ?? '')
    if (form.t === 'event') {
      const input: EventInput = { title: str('title'), date: str('date'), allDay: v.allDay === true, start: str('start') || null, end: str('end') || null, personId: str('person') || null }
      if (form.item) { const old = eventInput(form.item); const r = await updateEvent(form.item.rowId, input); if (await done(r, 'Event saved', () => updateEvent(form.item!.rowId, old))) after(back) }
      else { const r = await createEvent(input); if (await done(r, 'Event added', () => setDeleted('family_events', (r as { data: string }).data, true))) after(back) }
    } else if (form.t === 'task') {
      const input: TaskInput = { title: str('title'), due: str('due') || null, assigneePersonId: str('person') || null }
      if (form.item) { const old = taskInput(form.item); const r = await updateTask(form.item.rowId, input); if (await done(r, 'Task saved', () => updateTask(form.item!.rowId, old))) after(back) }
      else { const r = await createTask(input); if (await done(r, 'Task added', () => setDeleted('family_tasks', (r as { data: string }).data, true))) after(back) }
    } else if (form.t === 'appt') {
      const old = { at: new Date(form.item.when).toISOString(), status: form.item.status }
      const r = await updateAppointment(form.item.rowId, str('date'), str('time') || null, str('status'))
      if (await done(r, 'Appointment saved', () => restoreAppointment(form.item.rowId, form.item.allDay ? null : old.at, old.status))) after(back)
    } else {
      const times = parseTimesText(str('times'))
      if (!times) { toast.show('Use 24-hour times like 08:00, 20:00.'); return }
      const it = form.item
      confirm.ask(`This changes the reminder times on phones for ${it.title} (${nameOf(it.personId)}). Continue?`, async () => {
        const r = await updateMedTimes(it.rowId, it.schedule, times)
        if (await done(r, 'Medicine times saved', () => restoreMedSchedule(it.rowId, it.schedule))) after(back)
      })
    }
  }
  const remove = (form: Form, back: string | null) => {
    const it = form.t === 'event' || form.t === 'task' ? form.item : undefined
    if (!it) return
    const table = form.t === 'event' ? 'family_events' : 'family_tasks'
    confirm.ask(`Delete "${it.title}"? It also disappears from phones.`, async () => {
      if (await done(await setDeleted(table, it.rowId, true), 'Deleted', () => setDeleted(table, it.rowId, false))) after(back)
    })
  }

  const open = (day: string) => setPanel({ type: 'day', day })
  const edit = (i: AgendaItem, back: string | null) => {
    if (i.kind === 'event' || i.kind === 'task') setPanel({ type: 'form', form: { t: i.kind, item: i, day: itemDay(i) }, back })
    else if (i.kind === 'appointment') setPanel({ type: 'form', form: { t: 'appt', item: i }, back })
    else if (i.kind === 'dose') setPanel({ type: 'form', form: { t: 'meds', item: i }, back })
  }
  const addNew = (t: 'event' | 'task') => { setMenu(false); setPanel({ type: 'form', form: { t, day: view === 'month' || view === 'week' ? anchor : today }, back: null }) }

  const total = items.length
  return (
    <>
      <PageHead title="Calendar" sub="Events, tasks, appointments and medicine times for the whole family.">
        <div className="cal-new">
          <button className="dk-b go" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>New</button>
          {menu && (
            <div className="cal-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') setMenu(false) }}>
              <button role="menuitem" onClick={() => addNew('event')} autoFocus>Event</button>
              <button role="menuitem" onClick={() => addNew('task')}>Task</button>
            </div>
          )}
        </div>
      </PageHead>

      <div className="cal-bar">
        <div className="cal-nav">
          <a className="dk-b" href={link(today)}>Today</a>
          <a className="dk-b" href={link(step(-1))} aria-label={`Previous ${view === 'month' ? 'month' : view === 'week' ? 'week' : '30 days'}`}>&lsaquo;</a>
          <a className="dk-b" href={link(step(1))} aria-label={`Next ${view === 'month' ? 'month' : view === 'week' ? 'week' : '30 days'}`}>&rsaquo;</a>
          <h2 className="cal-title" aria-live="polite">{title}</h2>
        </div>
        <nav className="dk-tabs cal-views" aria-label="Calendar view">
          {VIEWS.map(([k, l]) => <a key={k} href={link(anchor, k)} aria-current={view === k ? 'page' : undefined}>{l}</a>)}
        </nav>
      </div>

      <div className="cal-filters">
        <div className="dk-filters" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button key={k.key} className="dk-chip cal-kind" aria-pressed={kinds.has(k.key)} onClick={() => flip(k.key)} style={{ '--k': `var(${k.color})` } as React.CSSProperties}>
              <i aria-hidden="true" />{k.label}
            </button>
          ))}
        </div>
        {people && people.length > 1 && (
          <div className="dk-filters" role="group" aria-label="Person">
            <button className="dk-chip" aria-pressed={person == null} onClick={() => setPerson(null)}>Everyone</button>
            {people.map((p) => <button key={p.id} className="dk-chip" aria-pressed={person === p.id} onClick={() => setPerson(person === p.id ? null : p.id)}>{p.display_name}</button>)}
          </div>
        )}
      </div>

      {data?.doseCapped && kinds.has('dose') && <p className="cal-note" role="note">Medicine times show for 14 days only: {dayLabel(data.doseFrom)} to {dayLabel(addDays(data.doseFrom, 13))}. Use the week view to see other days.</p>}
      {data?.partial && <p className="cal-note" role="note">Some items could not be loaded. Showing the rest.</p>}

      {failed ? <Empty>Could not load the calendar. <button className="dk-b" onClick={reload}>Try again</button></Empty>
        : !data ? <Skeleton rows={6} />
        : view === 'month' ? <Month anchor={anchor} today={today} items={items} nameOf={nameOf} onOpen={open} />
        : view === 'week' ? <Week anchor={anchor} today={today} items={items} nameOf={nameOf} onOpen={open} />
        : <Agenda from={from} today={today} items={items} nameOf={nameOf} onOpen={open} total={total} />}

      {panel?.type === 'day' && (
        <Panel title={longDay(panel.day)} onClose={() => setPanel(null)}>
          <DayList items={itemsOn(items, panel.day)} nameOf={nameOf} onTick={tickTask} onEdit={(i) => edit(i, panel.day)} onStatus={(i, s) => void setApptStatus(i.rowId, s).then((r) => done(r, 'Appointment updated', () => setApptStatus(i.rowId, i.status)))} />
          <div className="dk-acts">
            <button className="dk-b" onClick={() => setPanel({ type: 'form', form: { t: 'event', day: panel.day }, back: panel.day })}>Add event</button>
            <button className="dk-b" onClick={() => setPanel({ type: 'form', form: { t: 'task', day: panel.day }, back: panel.day })}>Add task</button>
          </div>
        </Panel>
      )}
      {panel?.type === 'form' && (
        <Panel title={formTitle(panel.form)} onClose={() => after(panel.back)}>
          <FormBody key={formKey(panel.form)} form={panel.form} people={people ?? []} onSave={(v) => save(panel.form, panel.back, v)} onCancel={() => after(panel.back)} onDelete={() => remove(panel.form, panel.back)} />
        </Panel>
      )}
      {confirm.node}
      {toast.node}
    </>
  )
}

const longDay = (d: string) => `${new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
const formTitle = (f: Form) => (f.t === 'event' ? (f.item ? 'Edit event' : 'New event') : f.t === 'task' ? (f.item ? 'Edit task' : 'New task') : f.t === 'appt' ? 'Change appointment' : 'Medicine times')
const formKey = (f: Form) => `${f.t}:${'item' in f && f.item ? f.item.id : 'new'}:${'day' in f ? f.day : ''}`

type NameOf = (id: string | null) => string
const who = (i: AgendaItem, nameOf: NameOf) => (i.personId ? nameOf(i.personId) : 'Whole family')
const hint = (i: AgendaItem) => (i.allDay ? i.when : fullTime(i.when))

function Chip({ i }: { i: AgendaItem }) {
  return (
    <li className={`cal-chip${i.done ? ' done' : ''}${i.overdue ? ' late' : ''}`} style={{ '--k': colour(i.kind) } as React.CSSProperties} title={`${KIND_ONE[i.kind]}: ${i.title}`}>
      <span className="wa-sr">{KIND_ONE[i.kind]}: </span>{!i.allDay && <b>{timeText(i).replace(' ', '')}</b>} <span className="cal-chip-t">{i.title}</span>
    </li>
  )
}

function Month({ anchor, today, items, onOpen }: { anchor: string; today: string; items: AgendaItem[]; nameOf: NameOf; onOpen: (d: string) => void }) {
  const grid = useMemo(() => monthGrid(monthOf(anchor)), [anchor])
  const box = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)
  useEffect(() => { if (refocus.current) { refocus.current = false; box.current?.querySelector<HTMLElement>(`[data-day="${anchor}"]`)?.focus() } }, [anchor])
  const by = useMemo(() => { const m = new Map<string, AgendaItem[]>(); for (const i of items) { const d = itemDay(i); (m.get(d) ?? m.set(d, []).get(d)!).push(i) } return m }, [items])
  const onKey = (e: RKeyboardEvent) => {
    const d = (e.target as HTMLElement).dataset.day
    if (!d) return
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0
    const to = delta ? addDays(d, delta) : e.key === 'PageDown' ? shiftMonth(monthOf(d), 1) + '-01' : e.key === 'PageUp' ? shiftMonth(monthOf(d), -1) + '-01' : null
    if (!to) return
    e.preventDefault(); refocus.current = true; go(to, 'month', true)
  }
  return (
    <div className="cal-month" ref={box} onKeyDown={onKey}>
      <div className="cal-wd" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid">
        {grid.map((d) => {
          const list = by.get(d) ?? []
          const label = `${dayLabel(d, today)}, ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}. ${list.length ? `${list.length} ${list.length === 1 ? 'item' : 'items'}` : 'Nothing scheduled'}`
          return (
            <div key={d} className={`cal-cell${monthOf(d) !== monthOf(anchor) ? ' out' : ''}${d === today ? ' today' : ''}`} onClick={() => onOpen(d)}>
              <button className="cal-day" data-day={d} tabIndex={d === anchor ? 0 : -1} aria-label={label} aria-current={d === today ? 'date' : undefined} onClick={(e) => { e.stopPropagation(); onOpen(d) }}>{Number(d.slice(8))}</button>
              <ul className="cal-chips">{list.slice(0, 3).map((i) => <Chip key={i.id} i={i} />)}</ul>
              {list.length > 3 && <span className="cal-more">+{list.length - 3} more</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Week({ anchor, today, items, nameOf, onOpen }: { anchor: string; today: string; items: AgendaItem[]; nameOf: NameOf; onOpen: (d: string) => void }) {
  return (
    <div className="cal-week">
      {weekDays(anchor).map((d) => {
        const list = itemsOn(items, d), allDay = list.filter((i) => i.allDay), timed = list.filter((i) => !i.allDay)
        const row = (i: AgendaItem) => (
          <li key={i.id} className={`cal-chip${i.done ? ' done' : ''}${i.overdue ? ' late' : ''}`} style={{ '--k': colour(i.kind) } as React.CSSProperties}>
            <button className="cal-item" onClick={() => onOpen(d)} title={`${KIND_ONE[i.kind]}, ${who(i, nameOf)}, ${hint(i)}`}>
              <span className="wa-sr">{KIND_ONE[i.kind]}: </span>{!i.allDay && <b>{timeText(i)}</b>} {i.title}
            </button>
          </li>
        )
        return (
          <section key={d} className={`cal-col${d === today ? ' today' : ''}`} aria-label={dayLabel(d, today)}>
            <h3><button className="cal-colh" onClick={() => onOpen(d)}>{dayLabel(d, today)}</button></h3>
            {list.length === 0 && <p className="cal-none">Nothing scheduled.</p>}
            {allDay.length > 0 && <ul className="cal-chips">{allDay.map(row)}</ul>}
            {timed.length > 0 && <ul className="cal-chips">{timed.map(row)}</ul>}
          </section>
        )
      })}
    </div>
  )
}

function Agenda({ from, today, items, nameOf, onOpen, total }: { from: string; today: string; items: AgendaItem[]; nameOf: NameOf; onOpen: (d: string) => void; total: number }) {
  const days = [...new Set(items.map(itemDay))].filter((d) => d >= from).sort()
  if (!total || !days.length) return <Empty>Nothing in the next {AGENDA_DAYS} days. Use New to add an event or task.</Empty>
  return (
    <div className="cal-agenda">
      {days.map((d) => (
        <section key={d} className="dk-card" aria-labelledby={`ag-${d}`}>
          <div className="dk-card-h"><h3 id={`ag-${d}`}>{dayLabel(d, today)} <span className="cal-sub">{d}</span></h3></div>
          <ul className="cal-rows">
            {itemsOn(items, d).map((i) => (
              <li key={i.id} className="cal-row" onClick={() => onOpen(d)}>
                <span className="cal-time" title={hint(i)}>{timeText(i)}</span>
                <span className="cal-tag" style={{ '--k': colour(i.kind) } as React.CSSProperties}><i aria-hidden="true" />{KIND_ONE[i.kind]}</span>
                <button className="dk-rowbtn cal-rt" onClick={(e) => { e.stopPropagation(); onOpen(d) }}>{i.title}</button>
                <span className="cal-who">{who(i, nameOf)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function DayList({ items, nameOf, onTick, onEdit, onStatus }: { items: AgendaItem[]; nameOf: NameOf; onTick: (i: AgendaItem) => void; onEdit: (i: AgendaItem) => void; onStatus: (i: AgendaItem, s: string) => void }) {
  if (!items.length) return <Empty>Nothing scheduled this day. Add an event or task below.</Empty>
  return (
    <ul className="cal-daylist">
      {items.map((i) => (
        <li key={i.id} style={{ '--k': colour(i.kind) } as React.CSSProperties}>
          <div className="cal-dl-main">
            <span className="cal-tag"><i aria-hidden="true" />{KIND_ONE[i.kind]}</span>
            <strong className={i.done ? 'done' : ''}>{i.title}</strong>
            <span className="cal-who" title={hint(i)}>{timeText(i)} &middot; {who(i, nameOf)}</span>
            {i.overdue && <Tag tone="warn">Overdue</Tag>}
            {i.kind === 'appointment' && i.status !== 'planned' && <Tag tone={i.status === 'done' ? 'ok' : 'bad'}>{i.status}</Tag>}
          </div>
          <div className="dk-acts">
            {i.kind === 'task' && <label className="cal-check"><input type="checkbox" checked={!!i.done} onChange={() => onTick(i)} /> Done</label>}
            {i.kind === 'appointment' && i.status === 'planned' && <button className="dk-b" onClick={() => onStatus(i, 'done')}>Mark done</button>}
            {i.editable && <button className="dk-b" onClick={() => onEdit(i)}>{i.kind === 'dose' ? 'Edit times' : i.kind === 'appointment' ? 'Reschedule' : 'Edit'}</button>}
            {!i.editable && i.personId && <a className="dk-b" href={deskHref('members', i.personId)}>Open member</a>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function FormBody({ form, people, onSave, onCancel, onDelete }: { form: Form; people: { id: string; display_name: string }[]; onSave: (v: Record<string, string | boolean>) => Promise<void>; onCancel: () => void; onDelete: () => void }) {
  const it = 'item' in form ? form.item : undefined
  const day = 'day' in form ? form.day : it ? itemDay(it) : manilaDay(new Date())
  const [v, setV] = useState<Record<string, string | boolean>>((): Record<string, string | boolean> => {
    if (form.t === 'event') return { title: it?.title ?? '', date: day, allDay: it ? it.allDay : true, start: it && !it.allDay ? manilaTime(it.when) : '', end: it?.endsAt ? manilaTime(it.endsAt) : '', person: it?.personId ?? '' }
    if (form.t === 'task') return { title: it?.title ?? '', due: it?.when ?? day, person: it?.personId ?? '' }
    if (form.t === 'appt') return { date: itemDay(form.item), time: form.item.allDay ? '' : manilaTime(form.item.when), status: form.item.status }
    return { times: (Array.isArray((form.item.schedule as { times?: string[] })?.times) ? (form.item.schedule as { times: string[] }).times : Array.isArray(form.item.schedule) ? (form.item.schedule as string[]) : []).join(', ') }
  })
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: { target: { value: string; checked?: boolean; type?: string } }) => setV((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? !!e.target.checked : e.target.value }))
  const submit = async (e: { preventDefault: () => void }) => { e.preventDefault(); setBusy(true); try { await onSave(v) } finally { setBusy(false) } }
  const forWho = (
    <label className="dk-field">{form.t === 'task' ? 'Assigned to' : 'For'}
      <select className="dk-in" value={String(v.person ?? '')} onChange={set('person')}><option value="">Whole family</option>{people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
    </label>
  )
  return (
    <form className="dk-form cal-form" onSubmit={submit} noValidate>
      {(form.t === 'event' || form.t === 'task') && <label className="dk-field dk-wide">Title<input className="dk-in" value={String(v.title)} onChange={set('title')} maxLength={200} required data-autofocus /></label>}
      {form.t === 'event' && <>
        <label className="dk-field">Date<input className="dk-in" type="date" value={String(v.date)} onChange={set('date')} required /></label>
        <div className="dk-field cal-allday"><span>Length</span><label className="cal-check"><input type="checkbox" checked={v.allDay === true} onChange={set('allDay')} /> All day</label></div>
        {v.allDay !== true && <>
          <label className="dk-field">Starts<input className="dk-in" type="time" value={String(v.start)} onChange={set('start')} required /></label>
          <label className="dk-field">Ends (optional)<input className="dk-in" type="time" value={String(v.end)} onChange={set('end')} /></label>
        </>}
        {forWho}
      </>}
      {form.t === 'task' && <>
        <label className="dk-field">Due date<input className="dk-in" type="date" value={String(v.due)} onChange={set('due')} /></label>
        {forWho}
      </>}
      {form.t === 'appt' && <>
        <p className="dk-wide cal-about">{form.item.title}</p>
        <label className="dk-field">Date<input className="dk-in" type="date" value={String(v.date)} onChange={set('date')} required /></label>
        <label className="dk-field">Time<input className="dk-in" type="time" value={String(v.time)} onChange={set('time')} required /></label>
        <label className="dk-field dk-wide">Status<select className="dk-in" value={String(v.status)} onChange={set('status')}>{APPT_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
      </>}
      {form.t === 'meds' && <>
        <p className="dk-wide cal-about">{form.item.title}</p>
        <label className="dk-field dk-wide">Reminder times (24-hour, separated by commas)<input className="dk-in" value={String(v.times)} onChange={set('times')} placeholder="08:00, 20:00" data-autofocus /></label>
        <p className="dk-wide cal-about">Saving changes the reminders on every phone that has this medicine.</p>
      </>}
      <div className="dk-wide dk-acts">
        <button className="dk-b go" type="submit" disabled={busy}>Save</button>
        <button className="dk-b" type="button" onClick={onCancel}>Cancel</button>
        {(form.t === 'event' || form.t === 'task') && it && <button className="dk-b bad cal-del" type="button" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  )
}
