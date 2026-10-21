import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ upsert: vi.fn(), del: vi.fn(), update: vi.fn(), getUser: vi.fn() }))
const ME = '11111111-1111-4111-8111-111111111111'
const people = [
  { id: 'p1', display_name: 'Test Admin', auth_user_id: ME, photo_path: null },
  { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null },
  { id: 'p3', display_name: 'Test Child', auth_user_id: null, photo_path: null },
  { id: 'p4', display_name: 'Test Cousin', auth_user_id: 'u4', photo_path: null }
]
const details = people.map((p) => ({ id: p.id, phone: null, birthdate: p.id === 'p3' ? '2020-01-02' : null, sex: null, blood_type: p.id === 'p3' ? 'O+' : null, address: null, aliases: [], allergies: ['Test Allergy'], conditions: [] }))
const carers = [{ carer_id: ME, person_id: 'p3', can_write: true }, { carer_id: 'u2', person_id: 'p3', can_write: false }]
// select() is awaitable and also has .order() / .eq(), like the PostgREST builder
const sel = (rows: unknown[]) => Object.assign(Promise.resolve({ data: rows, error: null }), { order: async () => ({ data: rows, error: null }) })
vi.mock('../../auth/client', () => ({
  supabase: {
    auth: { getUser: h.getUser },
    from: (t: string) => t === 'people'
      ? { select: (cols: string) => sel(cols.includes('auth_user_id') ? people : details), update: (p: unknown) => ({ eq: () => ({ select: () => h.update(p) }) }) }
      : { select: () => sel(carers), upsert: h.upsert, delete: () => ({ eq: () => ({ eq: () => ({ select: h.del }) }) }) }
  }
}))

import { addReadOnly } from './Carers'
import People, { ageOf, formOf, GRANTED, profilePatch } from './Person'

beforeEach(() => {
  h.upsert.mockReset().mockResolvedValue({ error: null })
  h.del.mockReset().mockResolvedValue({ data: [{}], error: null })
  h.update.mockReset().mockResolvedValue({ data: [{ id: 'p3' }], error: null })
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: ME } } })
})
afterEach(cleanup)

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
    expect((await addReadOnly('u4', 'p3', ME)).ok).toBe(true)
    expect(h.upsert).toHaveBeenCalledWith({ carer_id: 'u4', person_id: 'p3', can_write: false }, expect.anything())
  })
  it('never links the admin themself', async () => {
    expect((await addReadOnly(ME, 'p3', ME)).ok).toBe(false)
    expect(h.upsert).not.toHaveBeenCalled()
  })
})

describe('People page', () => {
  it('lists name, sign-in, age, blood type and carers count', async () => {
    render(<People id={null} />)
    const row = (await screen.findByRole('button', { name: 'Open Test Child' })).closest('tr') as HTMLElement
    await waitFor(() => expect(within(row).getByText('O+')).toBeTruthy())
    expect(within(row).getByText('No')).toBeTruthy()
    expect(within(row).getByText('2')).toBeTruthy() // two carers
  })

  it('panel shows carers with Can edit / Read only and adds a read-only link', async () => {
    render(<People id="p3" />)
    const carers = await screen.findByRole('region', { name: 'Carers' })
    await within(carers).findByText('Can edit')
    expect(within(carers).getByText('Read only')).toBeTruthy()
    const pick = within(carers).getByLabelText('Add a read-only carer') as HTMLSelectElement
    const names = [...pick.options].map((o) => o.text)
    expect(names).toEqual(['Choose a member', 'Test Cousin']) // not the admin, not the person, not existing carers
    fireEvent.change(pick, { target: { value: 'u4' } })
    fireEvent.click(within(carers).getByRole('button', { name: 'Add read-only link' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledWith({ carer_id: 'u4', person_id: 'p3', can_write: false }, expect.anything()))
  })

  it('Remove maps an RLS refusal to the forbidden message', async () => {
    h.del.mockResolvedValue({ data: [], error: null })
    render(<People id="p3" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Test Person as carer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect((await screen.findByText('This link cannot be removed.')).getAttribute('role')).toBe('alert')
  })

  it('Save profile updates only granted columns', async () => {
    render(<People id="p3" />)
    const form = await screen.findByRole('form', { name: 'Profile' })
    await waitFor(() => expect((within(form).getByLabelText('Birthday') as HTMLInputElement).value).toBe('2020-01-02'))
    fireEvent.change(within(form).getByLabelText('Address'), { target: { value: 'Test Street 1' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(h.update).toHaveBeenCalled())
    const patch = h.update.mock.calls[0]![0] as Record<string, unknown>
    expect(patch).toMatchObject({ display_name: 'Test Child', address: 'Test Street 1', blood_type: 'O+', birthdate: '2020-01-02', allergies: ['Test Allergy'] })
    expect(Object.keys(patch).every((k) => (GRANTED as readonly string[]).includes(k))).toBe(true)
  })
})
