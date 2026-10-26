import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { table: string; op: string; payload?: unknown }
const h = vi.hoisted(() => {
  const state = { tables: {} as Record<string, unknown[]>, calls: [] as { table: string; op: string; payload?: unknown }[] }
  const from = (table: string) => {
    let op = 'select', payload: unknown
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'gte', 'lt', 'lte', 'not', 'or', 'neq', 'eq', 'limit', 'order', 'single']) b[m] = () => b
    b.insert = (p: unknown) => { op = 'insert'; payload = p; return b }
    b.update = (p: unknown) => { op = 'update'; payload = p; return b }
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      if (op !== 'select') state.calls.push({ table, op, payload })
      return Promise.resolve({ data: op === 'select' ? state.tables[table] ?? [] : op === 'insert' ? { id: 'new-1' } : null, error: null }).then(res, rej)
    }
    return b
  }
  return { state, sb: { from, auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import Calendar from './Calendar'

const writes = (): Call[] => h.state.calls
beforeEach(() => {
  h.state.calls.length = 0
  h.state.tables = {
    people: [{ id: 'p1', display_name: 'Test Person', auth_user_id: null, photo_path: null }, { id: 'p2', display_name: 'Test Parent', auth_user_id: null, photo_path: null }],
    family_events: [{ id: 'e1', title: 'Clinic check', starts_at: '2026-03-18T02:00:00Z', ends_at: null, all_day: false, person_id: 'p1' }],
    family_tasks: [{ id: 't1', title: 'Renew supplies', due: '2026-03-18', assignee_person_id: null, done: false }],
    appointments: [{ id: 'a1', person_id: 'p1', starts_at: '2026-03-19T03:00:00Z', due_on: null, provider: 'Dr Test', facility: null, purpose: null, appt_status: 'planned', status: 'confirmed' }],
    medications: [{ id: 'm1', person_id: 'p1', name: 'Test Medicine', strength: '5 mg', schedule: { v: 1, times: ['08:00'] }, as_needed: false, med_status: 'active', deleted_at: null, status: 'confirmed' }],
    prescriptions: [], person_identifiers: [{ id: 'i1', person_id: 'p1', id_type: 'senior', expires_on: '2026-03-20', status: 'confirmed' }], insurance_policies: []
  }
})
afterEach(cleanup)

describe('Calendar', () => {
  it('draws the month with leading days, items and a note that medicine times are capped', async () => {
    render(<Calendar id="2026-03-18" sub="month" />)
    expect(await screen.findByText('Clinic check')).toBeTruthy()
    expect(screen.getAllByText('Renew supplies').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^Mon 23 Feb, 23 February/ })).toHaveLength(1)
    expect(screen.getByText(/Medicine times show for 14 days only/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'March 2026' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page')
  })

  it('month cell folds medicine times into one "Meds N" chip and keeps 2 other items before "+n more"', async () => {
    const med = (id: string, times: string[]) => ({ id, person_id: 'p1', name: `Medicine ${id}`, strength: null, schedule: { v: 1, times }, as_needed: false, med_status: 'active', deleted_at: null, status: 'confirmed' })
    h.state.tables.medications = [med('m1', ['08:00']), med('m2', ['08:00', '20:00'])] // 3 doses a day, shown for the first 14 days of the grid (from 23 Feb)
    h.state.tables.family_events = [1, 2, 3].map((n) => ({ id: `e${n}`, title: `Event ${n}`, starts_at: `2026-03-02T0${n}:00:00Z`, ends_at: null, all_day: false, person_id: 'p1' }))
    h.state.tables.family_tasks = []
    render(<Calendar id="2026-03-18" sub="month" />)
    await screen.findByText('Event 1')
    const cell = screen.getByRole('button', { name: /^Mon 2 Mar, 2 March/ }).closest('.cal-cell') as HTMLElement
    expect(within(cell).getByText('Meds').parentElement?.textContent).toBe('Medicine times: Meds 3') // 3 doses, one chip
    expect(within(cell).queryByText(/Medicine m[12]/)).toBeNull()
    expect(within(cell).getByText('Event 1')).toBeTruthy()
    expect(within(cell).getByText('Event 2')).toBeTruthy()
    expect(within(cell).queryByText('Event 3')).toBeNull()
    expect(within(cell).getByText('+1 more')).toBeTruthy()
  })

  it('opens the day panel with actions, and filters by kind', async () => {
    render(<Calendar id="2026-03-18" sub="week" />)
    await screen.findByRole('region', { name: 'Wed 18 Mar' })
    fireEvent.click(screen.getByRole('button', { name: 'Wed 18 Mar' }))
    const panel = await screen.findByRole('dialog', { name: /Wednesday, 18 March 2026/ })
    expect(within(panel).getByText('Clinic check')).toBeTruthy()
    expect(within(panel).getByRole('checkbox', { name: 'Done' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Edit times' })).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    await waitFor(() => expect(screen.queryByText(/Clinic check/)).toBeNull())
  })

  it('renders week and agenda views', async () => {
    const { unmount } = render(<Calendar id="2026-03-18" sub="week" />)
    expect(await screen.findByRole('region', { name: 'Mon 16 Mar' })).toBeTruthy()
    expect(screen.getAllByText(/Clinic check/).length).toBeGreaterThan(0)
    unmount()
    render(<Calendar id="2026-03-18" sub="agenda" />)
    expect(await screen.findByRole('heading', { name: /Wed 18 Mar/ })).toBeTruthy()
    expect(screen.getByText(/Senior citizen ID expires/)).toBeTruthy()
  })

  it('adds an event with created_by, a client id and only the table columns', async () => {
    render(<Calendar id="2026-03-18" sub="month" />)
    await screen.findByText('Clinic check')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Event' }))
    const panel = await screen.findByRole('dialog', { name: 'New event' })
    fireEvent.change(within(panel).getByLabelText('Title'), { target: { value: 'Test lunch' } })
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'All day' }))
    fireEvent.change(within(panel).getByLabelText('Starts'), { target: { value: '12:30' } })
    fireEvent.change(within(panel).getByLabelText('For'), { target: { value: 'p2' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    const w = writes()[0]
    expect(w).toMatchObject({ table: 'family_events', op: 'insert' })
    const row = w.payload as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(['all_day', 'client_id', 'created_by', 'ends_at', 'person_id', 'starts_at', 'title'])
    expect(row).toMatchObject({ created_by: 'u-1', title: 'Test lunch', all_day: false, person_id: 'p2', starts_at: '2026-03-18T04:30:00.000Z' })
    expect(String(row.client_id)).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByText('Event added')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()[1]).toMatchObject({ table: 'family_events', op: 'update', payload: { deleted_at: expect.any(String) } })
  })

  it('refuses to save an event with no title', async () => {
    render(<Calendar id="2026-03-18" sub="month" />)
    await screen.findByText('Clinic check')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Task' }))
    const panel = await screen.findByRole('dialog', { name: 'New task' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Check the date and times/)).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('deletes softly after a confirm, and ticks a task', async () => {
    render(<Calendar id="2026-03-18" sub="week" />)
    await screen.findByRole('region', { name: 'Wed 18 Mar' })
    fireEvent.click(screen.getByRole('button', { name: 'Wed 18 Mar' }))
    const panel = await screen.findByRole('dialog', { name: /Wednesday/ })
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Done' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toMatchObject({ table: 'family_tasks', op: 'update', payload: { done: true } })
    fireEvent.click(within(within(panel).getByText('Clinic check').closest('li')!).getByRole('button', { name: 'Edit' }))
    const form = await screen.findByRole('dialog', { name: 'Edit event' })
    fireEvent.click(within(form).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()[1]).toMatchObject({ table: 'family_events', op: 'update', payload: { deleted_at: expect.any(String) } })
  })

  it('changes medicine times only after a confirm and rejects bad times', async () => {
    render(<Calendar id="2026-03-18" sub="week" />)
    await screen.findByRole('region', { name: 'Wed 18 Mar' })
    fireEvent.click(screen.getByRole('button', { name: 'Wed 18 Mar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit times' }))
    const form = await screen.findByRole('dialog', { name: 'Medicine times' })
    const input = within(form).getByLabelText(/Reminder times/)
    expect((input as HTMLInputElement).value).toBe('08:00')
    fireEvent.change(input, { target: { value: '8am' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/24-hour times/)).toBeTruthy()
    expect(writes()).toHaveLength(0)
    fireEvent.change(input, { target: { value: '20:00, 08:00' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alertdialog')).textContent).toMatch(/reminder times on phones/)
    expect(writes()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Change times' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toMatchObject({ table: 'medications', op: 'update', payload: { schedule: { v: 1, times: ['08:00', '20:00'] } } })
  })

  it('reschedules an appointment with a status', async () => {
    render(<Calendar id="2026-03-19" sub="month" />)
    await screen.findByText(/Dr Test/)
    fireEvent.click(screen.getByRole('button', { name: /^Thu 19 Mar, 19 March/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule' }))
    const form = await screen.findByRole('dialog', { name: 'Change appointment' })
    expect((within(form).getByLabelText('Time') as HTMLInputElement).value).toBe('11:00')
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-03-20' } })
    fireEvent.change(within(form).getByLabelText('Status'), { target: { value: 'cancelled' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toMatchObject({ table: 'appointments', op: 'update', payload: { starts_at: '2026-03-20T03:00:00.000Z', appt_status: 'cancelled' } })
  })

  it('moves the focused day with the arrow keys', async () => {
    render(<Calendar id="2026-03-18" sub="month" />)
    await screen.findByText('Clinic check')
    const day = screen.getByRole('button', { name: /^Wed 18 Mar, 18 March/ })
    expect(day.getAttribute('tabindex')).toBe('0')
    window.location.hash = '#/calendar/2026-03-18/month'
    day.focus()
    fireEvent.keyDown(day, { key: 'ArrowRight' })
    await waitFor(() => expect(window.location.hash).toBe('#/calendar/2026-03-19/month'))
  })
})
