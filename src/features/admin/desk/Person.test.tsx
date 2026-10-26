import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), upsert: vi.fn(), del: vi.fn(), update: vi.fn(), getUser: vi.fn() }))
const people = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: ME, photo_path: null },
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null },
  { id: 'p3', display_name: 'Test Guest', auth_user_id: 'u3', photo_path: null },
  { id: 'p4', display_name: 'Test Child', auth_user_id: null, photo_path: null },
  { id: 'p5', display_name: 'Test Cousin', auth_user_id: 'u5', photo_path: null }
]
const details = people.map((p) => ({ id: p.id, phone: null, birthdate: p.id === 'p4' ? '2020-01-02' : null, sex: null, blood_type: p.id === 'p4' ? 'O+' : null, address: null, aliases: [], allergies: ['Test Allergy'], conditions: [] }))
const carers = [{ carer_id: ME, person_id: 'p4', can_write: true }, { carer_id: 'u2', person_id: 'p4', can_write: false }]
const members = [
  { userId: ME, personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', disabled: false, lastSignInAt: null, provider: 'google', profile: null },
  { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'testp', role: 'member', disabled: false, lastSignInAt: null, provider: 'email', profile: null, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 },
  { userId: 'u3', personId: 'p3', displayName: 'Test Guest', handle: null, role: 'member', disabled: false, lastSignInAt: null, provider: 'google', profile: null }
]
const chain = (rows: unknown[]) => {
  const c: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'order', 'limit']) c[k] = () => c
  c.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: 7 }).then(ok, bad)
  return c
}
vi.mock('../../auth/client', () => ({
  supabase: {
    auth: { getUser: h.getUser }, functions: { invoke: h.invoke }, rpc: h.rpc,
    from: (t: string) => t === 'people'
      ? { select: (cols: string) => chain(cols.includes('auth_user_id') ? people : details), update: (p: unknown) => ({ eq: () => ({ select: () => h.update(p) }) }) }
      : t === 'carers' ? { ...(chain(carers) as object), upsert: h.upsert, delete: () => ({ eq: () => ({ eq: () => ({ select: h.del }) }) }) }
      : chain(t === 'records_queue' ? [{ person_id: 'p4', drafts: 2 }] : [])
  }
}))
// The embedded tabs belong to other lanes: stand-ins that show the props they get.
vi.mock('./Records', () => ({ default: (p: { id: string | null; embedded?: boolean }) => <p>Records of {p.id} {p.embedded ? 'embedded' : 'page'}</p> }))
vi.mock('./Ids', () => ({ default: (p: { id: string | null; embedded?: boolean }) => <p>IDs of {p.id} {p.embedded ? 'embedded' : 'page'}</p> }))
vi.mock('./History', () => ({ default: (p: { id: string | null; person?: string; embedded?: boolean }) => <p>History of {p.person} {p.embedded ? 'embedded' : 'page'}</p> }))

import { addReadOnly } from './Carers'
import Members from './Members'
import { ageOf, formOf, GRANTED, profilePatch, signInBody } from './Person'

beforeEach(() => {
  h.upsert.mockReset().mockResolvedValue({ error: null })
  h.del.mockReset().mockResolvedValue({ data: [{}], error: null })
  h.update.mockReset().mockResolvedValue({ data: [{ id: 'p4' }], error: null })
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: ME } } })
  h.invoke.mockReset().mockImplementation(async (_n: string, o: { body: { action: string } }) => ({ data: o.body.action === 'list' ? { ok: true, members } : { ok: true }, error: null }))
  h.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === 'admin_identifiers' ? [{ id: 'i1' }, { id: 'i2' }] : [], error: null }))
  location.hash = '#/members/p4'
  Object.assign(people[3]!, { archived_at: null })
})
afterEach(cleanup)
const bodies = () => h.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body)
const page = async (id: string, sub: string | null = null) => {
  render(<Members id={id} sub={sub} />)
  await screen.findByRole('navigation', { name: 'Member sections' })
}

const blank = formOf('Test Person', undefined)

describe('profilePatch', () => {
  it('sends only granted columns and turns blanks into null', () => {
    const r = profilePatch({ ...blank, aliases: 'Tess\n tess \n\nT', allergies: 'Test Allergy', conditions: '' }, '2026-10-21')
    if ('error' in r) throw new Error(r.error)
    expect(Object.keys(r.patch).every((k) => (GRANTED as readonly string[]).includes(k))).toBe(true)
    expect(r.patch).toMatchObject({ display_name: 'Test Person', phone: null, birthdate: null, sex: null, blood_type: null, address: null, aliases: ['Tess', 'T'], allergies: ['Test Allergy'], conditions: [] })
    expect(r.patch).not.toHaveProperty('auth_user_id')
    expect(r.patch).not.toHaveProperty('created_by')
  })
  it('refuses a future birthday, a bad blood type or sex, and an empty name', () => {
    expect(profilePatch({ ...blank, birthdate: '2026-10-22' }, '2026-10-21')).toHaveProperty('error')
    expect(profilePatch({ ...blank, bloodType: 'C+' })).toHaveProperty('error')
    expect(profilePatch({ ...blank, sex: 'other' })).toHaveProperty('error')
    expect(profilePatch({ ...blank, name: '  ' })).toHaveProperty('error')
  })
  it('accepts today as a birthday', () => expect(profilePatch({ ...blank, birthdate: '2026-10-21' }, '2026-10-21')).toHaveProperty('patch'))
})

describe('ageOf', () => {
  it('counts whole years and is null for unknown', () => {
    expect(ageOf('2020-01-02', new Date(2026, 0, 1))).toBe(5)
    expect(ageOf('2020-01-02', new Date(2026, 0, 2))).toBe(6)
    expect(ageOf(null)).toBeNull()
    expect(ageOf('nonsense')).toBeNull()
  })
})

describe('addReadOnly', () => {
  it('always upserts can_write false', async () => {
    expect((await addReadOnly('u5', 'p4', ME)).ok).toBe(true)
    expect(h.upsert).toHaveBeenCalledWith({ carer_id: 'u5', person_id: 'p4', can_write: false }, expect.anything())
  })
  it('never links the admin themself', async () => {
    expect((await addReadOnly(ME, 'p4', ME)).ok).toBe(false)
    expect(h.upsert).not.toHaveBeenCalled()
  })
})

describe('Member page', () => {
  it('summary card: role, sign-in, state, age, blood type and the counts', async () => {
    await page('p4')
    const sum = screen.getByRole('region', { name: 'Summary' })
    expect(within(sum).getByText('Dependent')).toBeTruthy()
    expect(within(sum).getByText('No phone')).toBeTruthy()
    expect(within(sum).getByText('Cared for')).toBeTruthy()
    await waitFor(() => expect(within(sum).getByText('O+')).toBeTruthy())
    expect(within(sum).getAllByText('2', { selector: 'dd' })).toHaveLength(2) // drafts and IDs
    expect(within(sum).getByText('2 (1 can edit)')).toBeTruthy()
    expect(within(sum).getByText('7')).toBeTruthy() // papers
    expect(screen.getByRole('link', { name: 'Members' }).getAttribute('href')).toBe('#/members')
  })

  it('tabs are links with aria-current; the default is Profile', async () => {
    await page('p4')
    const tabs = screen.getByRole('navigation', { name: 'Member sections' })
    expect(within(tabs).getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBe('page')
    expect(within(tabs).getByRole('link', { name: /Carers/ }).getAttribute('href')).toBe('#/members/p4/carers')
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual(['Profile', 'Account', 'Carers', 'Records', 'IDs', 'History'])
  })

  it('Records, IDs and History tabs embed their pages for this person', async () => {
    await page('p4', 'records')
    expect(screen.getByText('Records of p4 embedded')).toBeTruthy()
    cleanup(); await page('p4', 'ids')
    expect(screen.getByText('IDs of p4 embedded')).toBeTruthy()
    cleanup(); await page('p4', 'history')
    expect(screen.getByText('History of p4 embedded')).toBeTruthy()
  })

  it('the form shows the real values from the start and Save sends only granted columns', async () => {
    await page('p4')
    const form = await screen.findByRole('form', { name: 'Profile' })
    expect((within(form).getByLabelText('Birthday') as HTMLInputElement).value).toBe('2020-01-02') // no empty first render
    const save = within(form).getByRole('button', { name: 'Save profile' }) as HTMLButtonElement
    expect(save.disabled).toBe(true) // nothing changed yet
    fireEvent.change(within(form).getByLabelText('Address'), { target: { value: 'Test Street 1' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() => expect(h.update).toHaveBeenCalled())
    const patch = h.update.mock.calls[0]![0] as Record<string, unknown>
    expect(patch).toMatchObject({ display_name: 'Test Child', address: 'Test Street 1', blood_type: 'O+', birthdate: '2020-01-02', allergies: ['Test Allergy'] })
    expect(Object.keys(patch).every((k) => (GRANTED as readonly string[]).includes(k))).toBe(true)
  })

  it('Cancel puts the saved values back', async () => {
    await page('p4')
    const form = await screen.findByRole('form', { name: 'Profile' })
    fireEvent.change(within(form).getByLabelText('Address'), { target: { value: 'Elsewhere' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect((within(form).getByLabelText('Address') as HTMLInputElement).value).toBe('')
  })

  it('leaving the Profile tab with unsaved changes asks first', async () => {
    await page('p4')
    const form = await screen.findByRole('form', { name: 'Profile' })
    fireEvent.change(within(form).getByLabelText('Address'), { target: { value: 'Test Street 1' } })
    const to = screen.getByRole('link', { name: 'Account' })
    fireEvent.click(to)
    expect(location.hash).toBe('#/members/p4') // not moved yet
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(location.hash).toBe('#/members/p4/account'))
  })

  it('a dependent with no login shows No sign-in for this person and Give a sign-in', async () => {
    await page('p4', 'account')
    expect(screen.getByText('No sign-in for this person.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Give a sign-in' }))
    expect(await screen.findByRole('form', { name: 'Give a sign-in' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Disable/ })).toBeNull()
  })

  it('Account: PIN member can be reset, unlocked and disabled; no Make admin for a PIN sign-in', async () => {
    await page('p2', 'account')
    expect(await screen.findByRole('button', { name: 'Reset PIN' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make admin' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'unlock', userId: 'u2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disable Test Person' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'disable', userId: 'u2', disabled: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'disable', userId: 'u2', disabled: false }))
  })

  it('Reset PIN sends set_pin with the typed PIN and shows it once', async () => {
    await page('p2', 'account')
    fireEvent.click(await screen.findByRole('button', { name: 'Reset PIN' }))
    const form = await screen.findByRole('form', { name: 'New PIN for Test Person' })
    fireEvent.change(within(form).getByLabelText('PIN (6 digits)'), { target: { value: '480193' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Set PIN' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'set_pin', userId: 'u2', pin: '480193' }))
    expect(await screen.findByText('A new PIN is shown once, to the admin. Give it to the person yourself.')).toBeTruthy()
  })

  it('Account: a Google member can be made admin; never yourself', async () => {
    await page('p3', 'account')
    fireEvent.click(await screen.findByRole('button', { name: 'Make admin' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'set_role', userId: 'u3', role: 'admin' }))
    cleanup(); await page('p1', 'account')
    await screen.findByText(/your own account/)
    expect(screen.queryByRole('button', { name: /Make member|Make admin|Disable|Enable/ })).toBeNull()
    expect(screen.queryByText('Danger zone')).toBeNull()
  })

  it('Carers tab lists carers and adds a read-only link only', async () => {
    await page('p4', 'carers')
    const carersBox = await screen.findByRole('region', { name: 'Carers' })
    await within(carersBox).findByText('Can edit')
    expect(within(carersBox).getByText('Read only')).toBeTruthy()
    const pick = within(carersBox).getByLabelText('Add a read-only carer') as HTMLSelectElement
    expect([...pick.options].map((o) => o.text)).toEqual(['Choose a member', 'Test Guest', 'Test Cousin']) // not the admin, not existing carers
    fireEvent.change(pick, { target: { value: 'u5' } })
    fireEvent.click(within(carersBox).getByRole('button', { name: 'Add read-only link' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledWith({ carer_id: 'u5', person_id: 'p4', can_write: false }, expect.anything()))
  })

  it('Remove maps an RLS refusal to the forbidden message', async () => {
    h.del.mockResolvedValue({ data: [], error: null })
    await page('p4', 'carers')
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Test Person as carer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect((await screen.findByText('This link cannot be removed.')).getAttribute('role')).toBe('alert')
  })

  it('an unknown person says so', async () => {
    render(<Members id="nope" />)
    expect(await screen.findByText(/not in the family list/)).toBeTruthy()
  })
})

const archiveCalls = () => h.rpc.mock.calls.filter((c) => c[0] === 'admin_set_archived').map((c) => c[1])

describe('Archive and sign-in', () => {
  it('Archive asks first, calls admin_set_archived true, and Undo calls it with false', async () => {
    await page('p4', 'account')
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Test Child' }))
    expect(await screen.findByText(/disappear from every family phone: lists, reminders and alerts\. Their records stay\. You can reactivate any time\./)).toBeTruthy()
    expect(archiveCalls()).toEqual([])
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(archiveCalls()).toEqual([{ p_person: 'p4', p_archived: true }]))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(archiveCalls()).toContainEqual({ p_person: 'p4', p_archived: false }))
  })

  it('a member can be archived too', async () => {
    await page('p2', 'account')
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Test Person' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(archiveCalls()).toEqual([{ p_person: 'p2', p_archived: true }]))
  })

  it('the admin never gets Archive for their own person', async () => {
    await page('p1', 'account')
    await screen.findByText(/your own account/)
    expect(screen.queryByRole('button', { name: /^Archive/ })).toBeNull()
  })

  it('an archived person shows the banner; Reactivate calls admin_set_archived false', async () => {
    Object.assign(people[3]!, { archived_at: '2026-10-20T02:00:00Z' })
    await page('p4', 'account')
    const banner = (await screen.findByText(/^Archived on/)).closest('.mp-archived') as HTMLElement
    expect(banner.textContent).toContain('Archived on 20 Oct 2026. Hidden from family phones.')
    expect(screen.queryByRole('button', { name: /^Archive / })).toBeNull()
    fireEvent.click(within(banner).getByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(archiveCalls()).toEqual([{ p_person: 'p4', p_archived: false }]))
  })

  it('Give a sign-in sends personId, says it reactivates an archived person, and shows the PIN once', async () => {
    Object.assign(people[3]!, { archived_at: '2026-10-20T02:00:00Z' })
    await page('p4', 'account')
    fireEvent.click(await screen.findByRole('button', { name: 'Give a sign-in' }))
    const form = await screen.findByRole('form', { name: 'Give a sign-in' })
    expect(within(form).getByText(/also reactivates them/)).toBeTruthy()
    fireEvent.change(within(form).getByLabelText('PIN (6 digits)'), { target: { value: '123456' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Give a sign-in' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/harder to guess/)
    expect(bodies().some((b) => b.action === 'create')).toBe(false)
    fireEvent.change(within(form).getByLabelText('PIN (6 digits)'), { target: { value: '480193' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Give a sign-in' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(bodies()).toContainEqual({ action: 'create', displayName: 'Test Child', pin: '480193', role: 'member', personId: 'p4' }))
    expect(await screen.findByText('A new PIN is shown once, to the admin. Give it to the person yourself.')).toBeTruthy()
    expect(screen.getByLabelText('PIN').textContent).toBe('480193')
  })

  it('signInBody includes the sign-in name only when typed', () => {
    expect(signInBody({ id: 'p4', display_name: 'Test Child' }, ' Kid_One ', '480193')).toEqual({ action: 'create', displayName: 'Test Child', handle: 'kid_one', pin: '480193', role: 'member', personId: 'p4' })
    expect(signInBody({ id: 'p4', display_name: 'Test Child' }, '', '480193')).not.toHaveProperty('handle')
  })
})
