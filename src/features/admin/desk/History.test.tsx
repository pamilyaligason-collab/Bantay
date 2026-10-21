import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { audit: { data: [] as unknown[], error: null as unknown }, ranges: [] as unknown[], eqs: [] as unknown[] }
  const from = vi.fn()
  return { state, from, sb: { from } as unknown }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import History from './History'

const row = (id: number, o: Record<string, unknown> = {}) => ({ id, at: '2026-10-01T01:00:00Z', actor: 'u1', tbl: 'lab_results', row_id: 'r', person_id: 'p1', action: 'update', fields: ['value_num', 'unit_raw'], ...o })

beforeEach(() => {
  h.state.audit = { data: [row(1), row(2, { actor: null, action: 'reveal', tbl: 'person_identifiers', fields: ['id_number'] })], error: null }
  h.state.ranges = []; h.state.eqs = []
  h.from.mockReset()
  h.from.mockImplementation((t: string) => {
    if (t === 'people') return { select: () => ({ order: async () => ({ data: [{ id: 'p1', display_name: 'Test Person', auth_user_id: 'u1', photo_path: null }], error: null }) }) }
    const q: Record<string, unknown> = {
      select: () => q, gte: () => q, lt: () => q, order: () => q,
      eq: (c: string, v: unknown) => { h.state.eqs.push([c, v]); return q },
      range: async (a: number, b: number) => { h.state.ranges.push([a, b]); return h.state.audit },
      limit: async () => ({ data: [{ id: 1, at: '2026-10-01T01:00:00Z', tbl: 'lab_results', row_id: 'abcdef12-0000', old_status: 'draft' }, { id: 2, at: '2026-10-01T01:00:00Z', tbl: 'lab_results', row_id: 'abcdef13-0000', old_status: 'draft' }], error: null })
    }
    return q
  })
})
afterEach(cleanup)

describe('History', () => {
  it('shows who, plain table words and field names; System when no actor', async () => {
    render(<History id={null} />)
    expect(await screen.findByText('value_num, unit_raw')).toBeTruthy()
    expect(screen.getAllByText('Test Person', { selector: 'td' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lab result').length).toBeGreaterThan(0)
    expect(screen.getByText('System')).toBeTruthy()
    expect(screen.getByText('id_number')).toBeTruthy() // a column name, never a value
  })

  it('pages with Older and filters reset to the first page', async () => {
    h.state.audit = { data: Array.from({ length: 101 }, (_, i) => row(i + 1)), error: null }
    render(<History id={null} />)
    await screen.findAllByText('value_num, unit_raw')
    expect(screen.getAllByRole('row')).toHaveLength(101) // header + 100: the 101st only proves "Older" exists
    fireEvent.click(screen.getByRole('button', { name: 'Older' }))
    await waitFor(() => expect(h.state.ranges).toContainEqual([100, 200]))
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'reveal' } })
    await waitFor(() => expect(h.state.eqs).toContainEqual(['action', 'reveal']))
    expect(h.state.ranges.at(-1)).toEqual([0, 100])
  })

  it('explains a missing audit table instead of failing', async () => {
    h.state.audit = { data: [], error: { code: 'PGRST205' } }
    render(<History id={null} />)
    expect(await screen.findByText('History starts after the 0021 update.')).toBeTruthy()
  })

  it('duplicate clean-up tab groups counts and lists short row ids only', async () => {
    render(<History id={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Duplicate clean-up/ }))
    expect(await screen.findByText('abcdef12')).toBeTruthy()
    expect(screen.getByText('2', { selector: 'td.num' })).toBeTruthy()
  })
  it('with a person prop the query is fixed to that person and the pickers are hidden', async () => {
    render(<History id={null} person="p9" embedded />)
    await screen.findByText('value_num, unit_raw')
    expect(h.state.eqs).toContainEqual(['person_id', 'p9'])
    expect(screen.queryByLabelText('Person')).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Person' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'History' })).toBeNull() // embedded: no page header
    expect(screen.queryByRole('button', { name: /Duplicate clean-up/ })).toBeNull() // global log, not per person
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'reveal' } })
    await waitFor(() => expect(h.state.eqs.at(-1)).toEqual(['action', 'reveal']))
    expect(h.state.eqs.filter((e) => (e as string[])[0] === 'person_id').length).toBeGreaterThan(1) // still fixed after another filter
  })
})
