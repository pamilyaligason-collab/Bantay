import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
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
