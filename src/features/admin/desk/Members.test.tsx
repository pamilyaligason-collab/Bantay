import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), insert: vi.fn(), getUser: vi.fn() }))
vi.mock('../../auth/client', () => ({ supabase: { functions: { invoke: h.invoke }, rpc: h.rpc, from: () => ({ insert: h.insert }), auth: { getUser: h.getUser } } }))

import Members, { createBody, dependentRow, memberState, type Row } from './Members'

const ME = '11111111-1111-4111-8111-111111111111'
const base: Row = { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'testp', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null }
const list: Row[] = [
  { ...base, userId: ME, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', provider: 'google' },
  { ...base, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 },
  { ...base, userId: 'u3', personId: 'p3', displayName: 'Test Other', handle: 'othertest', disabled: true }
]

beforeEach(() => {
  h.invoke.mockReset().mockImplementation(async (_n: string, o: { body: { action: string } }) => ({ data: o.body.action === 'list' ? { ok: true, members: list } : { ok: true }, error: null }))
  h.rpc.mockReset().mockResolvedValue({ data: [{ user_id: 'u2', last_seen: '2026-10-20T01:00:00Z', events: 12 }], error: null })
  h.insert.mockReset().mockResolvedValue({ error: null })
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: ME } } })
})
afterEach(cleanup)
const bodies = () => h.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body)

describe('memberState', () => {
  const now = Date.parse('2026-10-21T10:00:00Z')
  it('disabled beats everything', () => expect(memberState({ ...base, disabled: true, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 }, now).text).toBe('Disabled'))
  it('locked needs a future time and 5 wrong tries', () => {
    const s = memberState({ ...base, lockedUntil: '2026-10-21T10:15:00Z', fails: 5 }, now)
    expect(s.text).toMatch(/^Locked until \d{1,2}:\d{2}, 5 wrong tries$/)
    expect(s.locked).toBe(true)
  })
  it('a counting window below the limit, a lapsed lock and an old deploy are Active', () => {
    expect(memberState({ ...base, lockedUntil: '2026-10-21T10:15:00Z', fails: 2 }, now).text).toBe('Active')
    expect(memberState({ ...base, lockedUntil: '2026-10-21T09:00:00Z', fails: 5 }, now).text).toBe('Active')
    expect(memberState(base, now).text).toBe('Active')
  })
})

describe('payloads', () => {
  it('create is a member with an optional handle', () => {
    expect(createBody(' Test Person ', '', '480193')).toEqual({ action: 'create', displayName: 'Test Person', pin: '480193', role: 'member' })
    expect(createBody('Test Person', ' TestP ', '480193')).toMatchObject({ handle: 'testp' })
  })
  it('a dependent has a name and the creator only', () => expect(dependentRow(' Test Child ', ME)).toEqual({ display_name: 'Test Child', created_by: ME }))
})

describe('Members page', () => {
  it('lists members with state, links the name to the person and hides self actions', async () => {
    render(<Members id={null} />)
    const row = (await screen.findByRole('link', { name: 'Test Person' })).closest('tr') as HTMLElement
    expect(screen.getByRole('link', { name: 'Test Person' }).getAttribute('href')).toBe('#/members/p2')
    expect(within(row).getByText(/^Locked until/)).toBeTruthy()
    expect(within(row).getByText('PIN')).toBeTruthy()
    expect(within(row).getByText('12')).toBeTruthy()
    const mine = screen.getByRole('link', { name: 'Test Admin' }).closest('tr') as HTMLElement
    expect(within(mine).getByText('Google')).toBeTruthy()
    expect(within(mine).queryByRole('button')).toBeNull()
    expect(screen.getByText('Disabled')).toBeTruthy()
  })

  it('Unlock asks first, then sends unlock for that user', async () => {
    render(<Members id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock Test Person' }))
    expect(bodies().some((b) => b.action === 'unlock')).toBe(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'unlock', userId: 'u2' }))
  })

  it('Enable sends disabled false and the toast Undo sends it back', async () => {
    render(<Members id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enable Test Other' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'disable', userId: 'u3', disabled: false }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'disable', userId: 'u3', disabled: true }))
  })

  it('Add member refuses a weak PIN, then creates and shows the PIN once with the hand-over copy', async () => {
    render(<Members id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add member' }))
    const form = await screen.findByRole('form', { name: 'Add member' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Test New' } })
    fireEvent.change(within(form).getByLabelText('PIN (6 digits)'), { target: { value: '123456' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add member' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/harder to guess/)
    expect(bodies().some((b) => b.action === 'create')).toBe(false)
    fireEvent.change(within(form).getByLabelText('PIN (6 digits)'), { target: { value: '480193' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add member' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('A new PIN is shown once, to the admin. Give it to the person yourself.')).toBeTruthy()
    expect(screen.getByLabelText('PIN').textContent).toBe('480193')
    expect(bodies()).toContainEqual({ action: 'create', displayName: 'Test New', pin: '480193', role: 'member' })
  })

  it('Add dependent inserts the name and the admin as creator, with no sign-in', async () => {
    render(<Members id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add dependent' }))
    const form = await screen.findByRole('form', { name: 'Add dependent' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Test Child' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add dependent' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(h.insert).toHaveBeenCalledWith({ display_name: 'Test Child', created_by: ME }))
  })

  it('Reset PIN calls set_pin with the typed PIN', async () => {
    render(<Members id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reset PIN for Test Person' }))
    const form = await screen.findByRole('form', { name: 'New PIN for Test Person' })
    fireEvent.change(within(form).getByLabelText('PIN (6 digits)'), { target: { value: '480193' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Set PIN' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'set_pin', userId: 'u2', pin: '480193' }))
  })
})
