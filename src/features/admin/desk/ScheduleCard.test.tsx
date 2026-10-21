import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { tables: {} as Record<string, unknown[]>, fail: false }
  const from = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'gte', 'lt', 'lte', 'not', 'or', 'neq', 'eq', 'limit', 'order']) b[m] = () => b
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(state.fail ? { data: null, error: { code: 'x' } } : { data: state.tables[table] ?? [], error: null }).then(res, rej)
    return b
  }
  return { state, sb: { from } }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import ScheduleCard from './ScheduleCard'
import { addDays, todayManila } from './scheduleApi'

const today = todayManila()
beforeEach(() => {
  h.state.fail = false
  h.state.tables = {
    people: [{ id: 'p1', display_name: 'Test Person', auth_user_id: null, photo_path: null }, { id: 'p2', display_name: 'Test Parent', auth_user_id: null, photo_path: null }],
    medications: [
      { id: 'm1', person_id: 'p1', name: 'Test Medicine', schedule: { v: 1, times: ['08:00', '20:00'] }, as_needed: false, med_status: 'active', deleted_at: null },
      { id: 'm2', person_id: 'p2', name: 'Other Medicine', schedule: { v: 1, times: ['09:00'] }, as_needed: false, med_status: 'active', deleted_at: null }
    ],
    family_tasks: [{ id: 't1', title: 'Old chore', due: addDays(today, -2), assignee_person_id: null, done: false }, { id: 't2', title: 'Finished chore', due: today, assignee_person_id: null, done: true }]
  }
})
afterEach(cleanup)

describe('ScheduleCard', () => {
  it('summarises today\'s doses and lists overdue tasks first, hiding finished ones', async () => {
    render(<ScheduleCard />)
    expect(await screen.findByText('Medicine times today: 3 doses for 2 people')).toBeTruthy()
    expect(screen.getByText('Old chore')).toBeTruthy()
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.queryByText('Finished chore')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open calendar' }).getAttribute('href')).toBe('#/calendar')
  })
  it('says so when nothing is scheduled', async () => {
    h.state.tables = {}
    render(<ScheduleCard />)
    expect(await screen.findByText('Nothing scheduled this week.')).toBeTruthy()
    expect(screen.getByText('No medicine times today.')).toBeTruthy()
  })
  it('shows a skeleton first and an error line when loading fails', async () => {
    h.state.fail = true
    const { container } = render(<ScheduleCard />)
    expect(container.querySelector('.dk-skel')).toBeTruthy()
    expect(await screen.findByText(/Could not load the schedule/)).toBeTruthy()
  })
})
