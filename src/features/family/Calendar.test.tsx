import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
vi.mock('./useFamilyScope', () => ({ useLinkedPeople: () => [person('p1', 'Rey Villar', true), person('p2', 'Ma Villar')] })) // you and one link (invented); p3 is neither
import Calendar from './Calendar'
import { fdb } from './store'

beforeEach(async () => { await Promise.all([fdb.tasks.clear(), fdb.events.clear(), fdb.notes.clear()]) })
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

// D-109: a row tied to a person outside you and your links is hidden; a family-wide row (no person) stays.
describe('Calendar rows by person', () => {
  it('hides an event and a task for someone you are not linked to; keeps yours, a link\'s and the family\'s', async () => {
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
    for (const t of ['Own checkup', 'Ma dentist', 'Fetch Ma']) expect(list.textContent).toContain(t)
    for (const t of ['Tita clinic', 'Pay for Tita']) expect(list.textContent).not.toContain(t)
  })
})
