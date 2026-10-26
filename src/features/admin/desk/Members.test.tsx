import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), insert: vi.fn(), getUser: vi.fn(), data: {} as Record<string, unknown[]> }))
// A PostgREST-like builder: every method returns itself and it can be awaited.
const chain = (rows: unknown[]) => {
  const c: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'order', 'limit']) c[k] = () => c
  c.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok, bad)
  return c
}
vi.mock('../../auth/client', () => ({
  supabase: { functions: { invoke: h.invoke }, rpc: h.rpc, auth: { getUser: h.getUser }, from: (t: string) => ({ ...(chain(h.data[t] ?? []) as object), insert: h.insert }) }
}))

import Members, { createBody, dependentRow, filterLines, memberState, type Row } from './Members'
import { agoOf, carersText, needsAttention, roleOf, signInOf, stateOf, type Line } from './Person'

const base: Row = { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'testp', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null }
const members: Row[] = [
  { ...base, userId: ME, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', provider: 'google' },
  { ...base, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 },
  { ...base, userId: 'u3', personId: 'p3', displayName: 'Test Other', handle: 'othertest', disabled: true }
]
const people = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: ME, photo_path: null },
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null },
  { id: 'p3', display_name: 'Test Other', auth_user_id: 'u3', photo_path: null },
  { id: 'p4', display_name: 'Test Child', auth_user_id: null, photo_path: null }
]

beforeEach(() => {
  h.data = {
    people, records_queue: [{ person_id: 'p4', drafts: 3 }, { person_id: 'p4', drafts: 1 }],
    carers: [{ carer_id: ME, person_id: 'p4', can_write: true }, { carer_id: 'u2', person_id: 'p4', can_write: false }, { carer_id: ME, person_id: 'p2', can_write: false }]
  }
  h.invoke.mockReset().mockImplementation(async (_n: string, o: { body: { action: string } }) => ({ data: o.body.action === 'list' ? { ok: true, members } : { ok: true }, error: null }))
  h.rpc.mockReset().mockResolvedValue({ data: [{ user_id: 'u2', last_seen: '2026-10-20T01:00:00Z', events: 12 }], error: null })
  h.insert.mockReset().mockResolvedValue({ error: null })
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: ME } } })
  location.hash = '#/members'
  Object.assign(people[3]!, { archived_at: null })
})
afterEach(cleanup)
const bodies = () => h.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body)
const line = (o: Partial<Line> = {}): Line => ({ p: people[1]!, m: base, seen: null, drafts: 0, carers: 0, edit: 0, ...o })

describe('state and role labels', () => {
  const now = Date.parse('2026-10-21T10:00:00Z')
  it('disabled beats everything', () => expect(memberState({ ...base, disabled: true, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 }, now).text).toBe('Disabled'))
  it('locked needs a future time and 5 wrong tries', () => {
    const s = memberState({ ...base, lockedUntil: '2026-10-21T10:15:00Z', fails: 5 }, now)
    expect(s.text).toMatch(/^Locked until \d{1,2}:\d{2}, 5 tries$/)
    expect(s.locked).toBe(true)
  })
  it('a counting window below the limit, a lapsed lock and an old deploy are Active', () => {
    expect(memberState({ ...base, lockedUntil: '2026-10-21T10:15:00Z', fails: 2 }, now).text).toBe('Active')
    expect(memberState({ ...base, lockedUntil: '2026-10-21T09:00:00Z', fails: 5 }, now).text).toBe('Active')
    expect(memberState(base, now).text).toBe('Active')
  })
  it('role: Admin, Member, Dependent; state Cared for; sign-in PIN with handle, Google, No phone', () => {
    expect(roleOf(line({ m: { ...base, role: 'admin' } }))).toBe('Admin')
    expect(roleOf(line())).toBe('Member')
    const dep = line({ p: people[3]!, m: undefined })
    expect(roleOf(dep)).toBe('Dependent')
    expect(stateOf(dep).text).toBe('Cared for')
    expect(signInOf(dep)).toBe('No phone')
    expect(signInOf(line())).toBe('PIN, testp')
    expect(signInOf(line({ m: { ...base, provider: 'google' } }))).toBe('Google')
  })
  it('carers text keeps unknown apart from none', () => {
    expect(carersText(line({ carers: 2, edit: 1 }))).toBe('2 (1 can edit)')
    expect(carersText(line({ carers: 0, edit: 0 }))).toBe('None')
    expect(carersText(line({ carers: null, edit: null }))).toBe('Unknown')
  })
  it('relative time', () => {
    const t = Date.parse('2026-10-21T10:00:00Z')
    expect(agoOf('2026-10-21T08:00:00Z', t)).toBe('2 h ago')
    expect(agoOf('2026-10-21T09:55:00Z', t)).toBe('5 min ago')
    expect(agoOf(null)).toBe('Never')
    expect(agoOf('nonsense')).toBe('Never')
  })
})

describe('filters', () => {
  const dep = line({ p: people[3]!, m: undefined, drafts: 4, carers: 2, edit: 1 })
  const locked = line({ m: { ...base, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 } })
  const ok = line({ p: people[0]!, m: { ...base, role: 'admin', provider: 'google', displayName: 'Test Admin', handle: null }, carers: null, edit: null })
  const all = [dep, locked, ok]
  const names = (f: Parameters<typeof filterLines>[1], c = false, q = '') => filterLines(all, f, c, q).map((l) => l.p.display_name)
  it('chips', () => {
    expect(names('all')).toHaveLength(3)
    expect(names('login')).toEqual(['Test Person', 'Test Admin'])
    expect(names('dependents')).toEqual(['Test Child'])
    expect(names('attention')).toEqual(['Test Child', 'Test Person']) // drafts > 0, locked
    expect(needsAttention(ok)).toBe(false)
  })
  it('has carers and search by name or sign-in name', () => {
    expect(names('all', true)).toEqual(['Test Child'])
    expect(names('all', false, 'testp')).toEqual(['Test Person'])
    expect(names('all', false, 'google')).toEqual(['Test Admin'])
  })
})

describe('archived filter', () => {
  const kid = line({ p: { ...people[3]!, archived_at: '2026-10-20T02:00:00Z' }, m: undefined, drafts: 4, carers: 2, edit: 1 })
  const act = line({ p: people[0]!, m: { ...base, role: 'admin', provider: 'google', displayName: 'Test Admin', handle: null } })
  const names = (f: Parameters<typeof filterLines>[1]) => filterLines([kid, act], f, false, '').map((l) => l.p.display_name)
  it('archived people only show under the Archived chip, never in the others', () => {
    expect(names('archived')).toEqual(['Test Child'])
    expect(names('all')).toEqual(['Test Admin'])
    expect(names('dependents')).toEqual([])
    expect(names('attention')).toEqual([]) // drafts do not count for an archived person
    expect(stateOf(kid).text).toBe('Archived')
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
  it('one table of everyone: sign-in, role, state, carers, last seen and drafts', async () => {
    render(<Members id={null} />)
    const row = (await screen.findByRole('link', { name: /Test Person/ })).closest('tr') as HTMLElement
    expect(screen.getByRole('link', { name: /Test Person/ }).getAttribute('href')).toBe('#/members/p2')
    expect(within(row).getByText(/^Locked until/)).toBeTruthy()
    expect(within(row).getByText('PIN, testp')).toBeTruthy()
    expect(within(row).getByText('Member')).toBeTruthy()
    expect(within(row).getByText('1')).toBeTruthy() // one read-only carer
    const kid = screen.getByRole('link', { name: /Test Child/ }).closest('tr') as HTMLElement
    expect(within(kid).getByText('Dependent')).toBeTruthy()
    expect(within(kid).getByText('Cared for')).toBeTruthy()
    expect(within(kid).getByText('No phone')).toBeTruthy()
    expect(within(kid).getByText('2 (1 can edit)')).toBeTruthy()
    expect(within(kid).getByText('4')).toBeTruthy() // 3 + 1 drafts
    expect(within(row).queryByRole('button')).toBeNull() // actions live on the member page
  })

  it('clicking a row opens the member page', async () => {
    render(<Members id={null} />)
    const row = (await screen.findByRole('link', { name: /Test Child/ })).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByText('No phone'))
    expect(location.hash).toBe('#/members/p4')
  })

  it('chips narrow the table and Needs attention counts', async () => {
    render(<Members id={null} />)
    await screen.findByRole('link', { name: /Test Child/ })
    fireEvent.click(screen.getByRole('button', { name: 'Dependents' }))
    expect(screen.queryByRole('link', { name: /Test Person/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Test Child/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Needs attention \(3\)/ })) // locked, disabled, drafts
    expect(screen.getAllByRole('row')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No one matches/)).toBeTruthy()
  })

  it('Archived chip counts archived people and shows the tag and date; the default list hides them', async () => {
    Object.assign(people[3]!, { archived_at: '2026-10-20T02:00:00Z' })
    render(<Members id={null} />)
    await screen.findByRole('link', { name: /Test Person/ })
    expect(screen.queryByRole('link', { name: /Test Child/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }))
    const kid = screen.getByRole('link', { name: /Test Child/ }).closest('tr') as HTMLElement
    expect(within(kid).getByText('Archived')).toBeTruthy()
    expect(within(kid).getByText('20 Oct 2026')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Test Person/ })).toBeNull()
  })

  it('sorts by a column', async () => {
    render(<Members id={null} />)
    await screen.findByRole('link', { name: /Test Child/ })
    fireEvent.click(screen.getByRole('button', { name: 'To confirm' }))
    const first = screen.getAllByRole('row')[1]!
    expect(within(first).getAllByRole('cell').at(-1)!.textContent).toBe('0') // 0 drafts first, ascending (ties keep the needs-attention order)
    expect(screen.getByRole('columnheader', { name: /To confirm/ }).getAttribute('aria-sort')).toBe('ascending')
  })

  it('Add member refuses a weak PIN, then creates and shows the PIN once', async () => {
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
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Test Kid' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add dependent' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(h.insert).toHaveBeenCalledWith({ display_name: 'Test Kid', created_by: ME }))
  })

  it('Invite by email sends invite after a confirm', async () => {
    render(<Members id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Invite by email' }))
    const form = await screen.findByRole('form', { name: 'Invite by email' })
    fireEvent.change(within(form).getByLabelText('Google email'), { target: { value: 'test@example.test' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Invite' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'invite', email: 'test@example.test' }))
  })
})
