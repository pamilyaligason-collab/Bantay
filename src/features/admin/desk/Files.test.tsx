import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { files: [] as unknown[], updates: [] as unknown[], eqs: [] as unknown[] }
  const from = vi.fn()
  return { state, from, sb: { from } as unknown }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import Files from './Files'

const file = (id: string, status: string, o: Record<string, unknown> = {}) => ({
  id, person_id: 'p1', name: `${id}.jpg`, page_no: 2, ingest_status: status, ingest_error: null, ingest_tries: 1, created_at: '2026-10-01T01:00:00Z',
  storage_path: `p1/${id}.jpg`, drive_file_id: null, documents: { kind: 'lab', page_count: 3 }, ...o
})

beforeEach(() => {
  h.state.files = [file('bad', 'failed', { ingest_error: 'too_many_tries' }), file('drive', 'failed', { storage_path: null, drive_file_id: 'abc' }), file('ok', 'done')]
  h.state.updates = []; h.state.eqs = []
  h.from.mockReset()
  h.from.mockImplementation((t: string) => {
    if (t === 'people') return { select: () => ({ order: async () => ({ data: [{ id: 'p1', display_name: 'Test Person', auth_user_id: null, photo_path: null }], error: null }) }) }
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { h.state.eqs.push([c, v]); return q },
      order: () => q,
      limit: async () => ({ data: h.state.files, error: null }),
      update: (p: unknown) => { h.state.updates.push(p); return q }
    }
    q.then = undefined
    // update(...).eq().eq().select('id') resolves here
    q.select = (cols?: string) => (cols === 'id' ? Promise.resolve({ data: [{ id: 'bad' }], error: null }) : q)
    return q
  })
})
afterEach(cleanup)

describe('Files', () => {
  it('lists person, page, status and the plain-words problem', async () => {
    render(<Files id={null} />)
    expect(await screen.findByText('bad.jpg')).toBeTruthy()
    expect(screen.getAllByText('Test Person').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2 of 3').length).toBe(3)
    expect(screen.getByText('Tried too many times')).toBeTruthy()
  })

  it('Retry only on failed rows with an uploaded copy, after a confirm, with the reset payload', async () => {
    render(<Files id={null} />)
    await screen.findByText('bad.jpg')
    expect(screen.getAllByRole('button', { name: /^Retry / })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry bad.jpg' }))
    expect(h.state.updates).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))
    await waitFor(() => expect(h.state.updates).toEqual([{ ingest_status: 'new', ingest_tries: 0, ingest_error: null }]))
    expect(await screen.findByText('Queued to read again.')).toBeTruthy()
  })

  it('a filter chip queries by status', async () => {
    render(<Files id={null} />)
    await screen.findByText('bad.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    await waitFor(() => expect(h.state.eqs).toContainEqual(['ingest_status', 'failed']))
  })
})
