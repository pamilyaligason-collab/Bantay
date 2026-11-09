import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
vi.mock('./useFamilyScope', () => ({ useLinkedPeople: () => [person('p1', 'Rey Villar', true), person('p2', 'Ma Villar')] })) // you and one link (invented); p3 is neither
vi.mock('./roster', async (orig) => ({ ...(await orig<object>()), useFamilyPeople: () => ({ selfId: 'p1', people: [person('p1', 'Rey Villar', true), person('p2', 'Ma Villar'), person('p3', 'Tita Villar')] }) })) // the whole family, as the Add sheet lists it
import { db } from '../../db'
import Calendar from './Calendar'
import { dayKey } from './events'
import { fdb } from './store'

beforeEach(async () => { await Promise.all([fdb.tasks.clear(), fdb.events.clear(), fdb.notes.clear(), db.outbox.clear()]) })
afterEach(() => { cleanup(); vi.useRealTimers() })

// ML-38: "today" is the phone's local day. Around midnight the clock is faked (Date only, so the databases keep working) to 23:30 and 00:30 local.
describe.each([
  ['23:30 on Tue 27 Oct', new Date(2026, 9, 27, 23, 30), '27', 'Everyone'],
  ['00:30 on Wed 28 Oct', new Date(2026, 9, 28, 0, 30), '28', 'Everyone · Overdue']
])('Calendar at %s', (_label, at, num, taskSub) => {
  it('marks the local day as today and lists a task due 27 Oct as due (before midnight) or overdue (after)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at)
    await fdb.tasks.put({ clientId: 't1', title: 'Buy rice', due: '2026-10-27', assigneePersonId: null, done: false })
    render(<Calendar />)
    const today = await screen.findByRole('button', { pressed: true })
    expect(today.hasAttribute('data-today')).toBe(true)
    expect(today.textContent).toContain(num)
    const list = screen.getByRole('list', { name: 'Today' })
    await waitFor(() => expect(list.textContent).toContain('Buy rice'))
    expect(list.textContent).toContain(taskSub)
    expect(list.textContent?.includes('Overdue')).toBe(num === '28')
  })
})

// D-168 fix round: every Plan task and event shows as before the merge, whoever it is assigned to (only doses and visits follow readable people, D-109).
describe('Calendar rows by person', () => {
  it('shows an event and a task for someone outside the readable list, plus yours, a link\'s and the family\'s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 10, 0))
    const at = (h: number) => new Date(2026, 9, 27, h, 0).toISOString()
    await fdb.events.bulkPut([
      { clientId: 'e1', title: 'Own checkup', startsAt: at(9), endsAt: null, allDay: false, personId: 'p1' },
      { clientId: 'e2', title: 'Ma dentist', startsAt: at(11), endsAt: null, allDay: false, personId: 'p2' },
      { clientId: 'e3', title: 'Tita clinic', startsAt: at(12), endsAt: null, allDay: false, personId: 'p3' },
      { clientId: 'e4', title: 'Family lunch', startsAt: at(13), endsAt: null, allDay: false, personId: null }
    ])
    await fdb.tasks.bulkPut([
      { clientId: 't1', title: 'Fetch Ma', due: '2026-10-27', assigneePersonId: 'p2', done: false },
      { clientId: 't2', title: 'Pay for Tita', due: '2026-10-27', assigneePersonId: 'p3', done: false }
    ])
    render(<Calendar />)
    const list = screen.getByRole('list', { name: 'Today' })
    await waitFor(() => expect(list.textContent).toContain('Family lunch'))
    for (const t of ['Own checkup', 'Ma dentist', 'Fetch Ma', 'Tita clinic', 'Pay for Tita', 'Family lunch']) expect(list.textContent).toContain(t)
  })

  it('names only readable people on a row: Ma by name, p3 (not readable) as Family', async () => {
    // Titles name nobody, so each sub-text alone shows who is named. The pre-fix nameOf read the whole family list, so p3's row said "Tita":
    // `toBe('Family')` on that row and `not.toContain('Tita')` on the page both fail there; Ma's row is the control.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 10, 0))
    await fdb.tasks.bulkPut([
      { clientId: 't1', title: 'Buy bread', due: '2026-10-27', assigneePersonId: 'p2', done: false },
      { clientId: 't2', title: 'Pay water bill', due: '2026-10-27', assigneePersonId: 'p3', done: false }
    ])
    render(<Calendar />)
    const list = screen.getByRole('list', { name: 'Today' })
    await waitFor(() => expect(list.textContent).toContain('Pay water bill'))
    const sub = (title: string) => within(list).getAllByRole('listitem').find((r) => r.textContent?.includes(title))!.querySelector('.sub')!.textContent
    expect(sub('Buy bread')).toBe('Ma')
    expect(sub('Pay water bill')).toBe('Family')
    expect(document.body.textContent).not.toContain('Tita')
  })

  it('keeps an item 3 months ahead under Later and a done task under Done; week and month buttons page the view', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 10, 0))
    await fdb.tasks.bulkPut([
      { clientId: 'f1', title: 'Renew licence', due: '2027-01-27', assigneePersonId: 'p3', done: false },
      { clientId: 'd1', title: 'Paid water bill', due: '2026-10-20', assigneePersonId: null, done: true },
      { clientId: 'd2', title: 'Ancient chore', due: '2026-06-01', assigneePersonId: null, done: true }
    ])
    render(<Calendar />)
    const later = await screen.findByTestId('cal-later')
    expect(later.textContent).toContain('Renew licence')
    const done = screen.getByTestId('cal-done')
    expect(done.textContent).toContain('Paid water bill')
    expect(done.textContent).not.toContain('Ancient chore')
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByRole('heading', { name: /November/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { name: /October/ })).toBeTruthy()
  })
})

// D-168: Plan folded into the Calendar. Everything the old Plan list held stays visible, and the same add / tick / edit flows work.
describe('Calendar holds the old Plan (D-168)', () => {
  const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add event, reminder or note' }))

  it('today is aria-current=date; one Add button names all three kinds; the old Full plan link is gone', async () => {
    render(<Calendar />)
    const today = await screen.findByRole('button', { pressed: true })
    expect(today.getAttribute('aria-current')).toBe('date')
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Add event, reminder or note' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Full plan' })).toBeNull()
  })

  it('shows every saved Plan item: dated task, event, pinned note, an undated task and an unpinned note under No date', async () => {
    const day = dayKey(new Date())
    await fdb.tasks.bulkPut([
      { clientId: 't1', title: 'Pay water bill', due: day, assigneePersonId: null, done: false },
      { clientId: 't2', title: 'Renew PhilHealth', due: null, assigneePersonId: 'p2', done: false }
    ])
    await fdb.events.put({ clientId: 'e1', title: 'Family dinner', startsAt: new Date().toISOString(), endsAt: null, allDay: true, personId: null })
    await fdb.notes.bulkPut([{ clientId: 'n1', body: 'Gate code 1234', pinned: true }, { clientId: 'n2', body: 'Wifi is in the drawer', pinned: false }])
    render(<Calendar />)
    await waitFor(() => expect(screen.getByTestId('cal-nodate').textContent).toContain('Renew PhilHealth'))
    const text = screen.getByTestId('calendar').textContent ?? ''
    for (const t of ['Pay water bill', 'Family dinner', 'Gate code 1234', 'Pinned note', 'Wifi is in the drawer', 'Renew PhilHealth']) expect(text).toContain(t)
    expect(screen.getByTestId('cal-nodate').textContent).toContain('No date')
    for (const k of ['Task', 'Event', 'Note']) expect(within(screen.getByTestId('calendar')).getAllByText(k).length).toBeGreaterThan(0) // each row carries its type tag
  })

  it('adds a task, ticks it and writes an outbox row each time', async () => {
    render(<Calendar />)
    await screen.findByRole('button', { pressed: true })
    add()
    fireEvent.change(screen.getByLabelText('What needs doing?'), { target: { value: 'Buy rice' } })
    await waitFor(() => expect(within(screen.getByLabelText('Who does it?')).getAllByRole('option').length).toBe(4)) // Everyone + the whole family (three people)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const box = await screen.findByRole('checkbox', { name: 'Buy rice' })
    expect(box.getAttribute('aria-checked')).toBe('false')
    expect((await fdb.tasks.toArray())[0]).toMatchObject({ title: 'Buy rice', due: dayKey(new Date()) })
    fireEvent.click(box)
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Buy rice' }).getAttribute('aria-checked')).toBe('true'))
    await waitFor(async () => expect(await db.outbox.count()).toBe(2))
  })

  it('refuses an empty title and saves nothing', async () => {
    render(<Calendar />)
    await screen.findByRole('button', { pressed: true })
    add()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Type a name first.')
    expect(await db.outbox.count()).toBe(0)
  })

  it('opens a saved task, event or note from its row to edit it', async () => {
    await fdb.notes.put({ clientId: 'n2', body: 'Wifi is in the drawer', pinned: false })
    render(<Calendar />)
    fireEvent.click(await screen.findByRole('button', { name: /Wifi is in the drawer/ }))
    expect((await screen.findByLabelText('Note for the family') as HTMLTextAreaElement).value).toBe('Wifi is in the drawer')
  })

  it('adds a pinned note from the one Add button', async () => {
    render(<Calendar />)
    await screen.findByRole('button', { pressed: true })
    add()
    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByLabelText('Note for the family'), { target: { value: 'Gate code 1234' } })
    fireEvent.click(screen.getByLabelText('Pin it to the top'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Today' }).textContent).toContain('Pinned note'))
    expect((await fdb.notes.toArray())[0]).toMatchObject({ body: 'Gate code 1234', pinned: true })
  })
})
