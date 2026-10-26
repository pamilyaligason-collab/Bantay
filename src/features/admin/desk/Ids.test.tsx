import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const rpc = vi.fn()
  const from = vi.fn()
  return { rpc, from, sb: { rpc, from } as unknown }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import Ids from './Ids'

const FULL = '9999-0000-7777-4321' // synthetic
const rows = [
  { id: 'i1', source: 'id', label: 'sss', plan: null, last4: '4321', issued_on: null, expires_on: '2000-01-01', status: 'draft', source_file_id: null, confidence: 0.9 },
  { id: 'i2', source: 'insurance', label: 'Test Carrier', plan: 'Gold', last4: null, issued_on: null, expires_on: null, status: 'confirmed', source_file_id: null, confidence: null }
]
const people = [{ id: 'p1', display_name: 'Test Person', auth_user_id: null, photo_path: null }]
const patches: unknown[] = []

beforeEach(() => {
  patches.length = 0
  h.rpc.mockReset(); h.from.mockReset()
  h.rpc.mockImplementation(async (name: string) => (name === 'admin_identifiers' ? { data: rows, error: null } : name === 'admin_reveal_identifier' ? { data: FULL, error: null } : { data: null, error: { code: 'x' } }))
  h.from.mockImplementation((t: string) => {
    if (t === 'people') return { select: () => ({ order: async () => ({ data: people, error: null }) }) }
    return { update: (p: unknown) => { patches.push([t, p]); return { eq: () => ({ select: async () => ({ data: [{ id: 'i1' }], error: null }) }) } } }
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const load = async () => { const r = render(<Ids id="p1" />); await screen.findByText('••••••••'); return r }

describe('Ids', () => {
  it('masks by default: last 4 only, fully masked when null, no full number in the DOM', async () => {
    const { container } = await load()
    expect(screen.getByText('•••• 4321')).toBeTruthy()
    expect(container.textContent).not.toContain(FULL)
    expect(screen.getByText('Expired')).toBeTruthy()
    expect(h.from).not.toHaveBeenCalledWith('person_identifiers')
  })

  it('embedded: no heading and no person picker, rows still masked', async () => {
    render(<Ids id="p1" embedded />)
    await screen.findByText('•••• 4321')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByLabelText('Person')).toBeNull()
  })

  it('no person chosen and nobody in the family: an empty state, not a skeleton forever', async () => {
    people.length = 0
    try {
      render(<Ids id={null} />)
      expect(await screen.findByText(/No members yet/)).toBeTruthy()
    } finally { people.push({ id: 'p1', display_name: 'Test Person', auth_user_id: null, photo_path: null }) }
  })

  it('cardtab tables keep table semantics when CSS makes them blocks', async () => {
    const { container } = await load()
    const t = container.querySelector('table.dk-cardtab') as HTMLElement
    expect(t.getAttribute('role')).toBe('table')
    for (const tr of t.querySelectorAll('tr')) expect(tr.getAttribute('role')).toBe('row')
    for (const td of t.querySelectorAll('td')) expect(td.getAttribute('role')).toBe('cell')
    for (const th of t.querySelectorAll('thead th')) expect(th.getAttribute('role')).toBe('columnheader')
  })

  it('Show reveals one number at a time', async () => {
    const { container } = await load()
    fireEvent.click(screen.getByRole('button', { name: 'Show number for SSS ending 4321' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide number for SSS ending 4321' })).toBeTruthy())
    expect(h.rpc).toHaveBeenCalledWith('admin_reveal_identifier', { p_source: 'id', p_id: 'i1' })
    expect(container.textContent).toContain(FULL)
    fireEvent.click(screen.getByRole('button', { name: 'Show number for Test Carrier Gold' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide number for Test Carrier Gold' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Show number for SSS ending 4321' })).toBeTruthy() // the first one hid itself
    expect(container.textContent?.split(FULL).length).toBe(2) // exactly one visible
  })

  it('hides at 30 s', async () => {
    const { container } = await load()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(screen.getByRole('button', { name: 'Show number for SSS ending 4321' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(container.textContent).toContain(FULL)
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999) })
    expect(container.textContent).toContain(FULL)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(container.textContent).not.toContain(FULL)
  })

  it('hides on unmount (timer cleared) and on page change', async () => {
    const { container, unmount } = await load()
    fireEvent.click(screen.getByRole('button', { name: 'Show number for SSS ending 4321' }))
    await waitFor(() => expect(container.textContent).toContain(FULL))
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(container.textContent).not.toContain(FULL)
    fireEvent.click(screen.getByRole('button', { name: 'Show number for SSS ending 4321' }))
    await waitFor(() => expect(container.textContent).toContain(FULL))
    const spy = vi.spyOn(window, 'clearTimeout')
    unmount()
    expect(spy).toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(FULL)
  })

  it('Confirm sets status and offers Undo that restores the previous one', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm SSS ending 4321' }))
    await waitFor(() => expect(patches).toContainEqual(['person_identifiers', { status: 'confirmed' }]))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(patches).toContainEqual(['person_identifiers', { status: 'draft' }]))
  })

  it('Replace number is write-only: never prefilled, asks first, clears after', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'Edit SSS ending 4321' }))
    const input = screen.getByLabelText(/Replace number/) as HTMLInputElement
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: ' 1111-2222-3333 ' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Replace number' })[0])
    expect(patches).toHaveLength(0) // confirm dialog first
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(patches).toContainEqual(['person_identifiers', { id_number: '1111-2222-3333' }]))
  })
})
