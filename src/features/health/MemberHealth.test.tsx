import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe: id === 'me' })
const setPersonId = vi.fn()
const st = {
  ready: true, personId: 'ma', canMark: false, lockReason: null as string | null,
  people: [person('me', 'Maria Sample'), person('ma', 'Ma Sample')],
  readings: [{ personId: 'ma', test: 'bp_systolic', value: 130, unit: 'mmHg', takenAt: new Date().toISOString() }] as object[],
  thresholds: [] as object[]
}
const hp = { acting: false }
vi.mock('./useHealthPerson', () => ({ useHealthPerson: () => ({ ...st, ownId: 'me', setPersonId, acting: hp.acting }) }))
const va = { can: false, busy: null as string | null, err: '', go: vi.fn() }
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<typeof import('../viewas/viewAs')>()), useActingPersonId: () => null, useViewAs: () => va }))
const mem = { owner: false }
vi.mock('../auth/session', async (orig) => ({ ...(await orig<typeof import('../auth/session')>()), getMember: async () => ({ userId: 'u1', personId: 'me', role: 'admin', handle: null, isOwner: mem.owner }) }))
const roster = { login: null as string | null }
vi.mock('../admin/desk/viewAsData', () => ({ loadRoster: async () => ({ people: [{ id: 'ma', auth_user_id: roster.login }], carers: [] }) }))
const names = ['Aspirin', 'Bisoprolol', 'Metformin', 'Simvastatin']
const today = { meds: [], takes: [], week: [], day: '2026-11-01', doses: names.map((n, i) => ({ key: `k${i}`, name: n, slot: '08:00', state: 'pending' })) as object[] }
vi.mock('./Medicines', () => ({ useToday: () => today }))

import { MemberHealth } from './MemberHealth'

beforeEach(() => { mem.owner = false; roster.login = null; hp.acting = false; va.can = false; va.err = ''; va.go.mockClear(); setPersonId.mockClear(); st.ready = true; st.canMark = false; st.lockReason = null; today.doses = names.map((n, i) => ({ key: `k${i}`, name: n, slot: '08:00', state: 'pending' })) })
afterEach(cleanup)

describe('MemberHealth (view only)', () => {
  it('bar, back link, doses as text with no write controls, summary rows and the view-only footer', () => {
    const { container } = render(<MemberHealth id="ma" />)
    const bar = screen.getByTestId('member-bar')
    expect(bar.textContent).toContain('Viewing Ma · view only')
    expect(within(bar).getByRole('link', { name: 'Back to me' }).getAttribute('href')).toBe('#health')
    expect(screen.getByText('Ma today')).toBeTruthy()
    expect(screen.getByText('0 of 4 taken')).toBeTruthy()
    expect(screen.getAllByText('Not yet')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /take|skip/i })).toBeNull()
    expect([...container.querySelectorAll('button')].filter((b) => !b.classList.contains('ps-pill'))).toHaveLength(0) // the only button is the member chip (opens the picker)
    expect(screen.getByRole('link', { name: /^Readings/ }).getAttribute('href')).toBe('#health/readings')
    expect(screen.getByRole('link', { name: /^Labs/ }).getAttribute('href')).toBe('#health/labs')
    expect(screen.getByRole('link', { name: /^Questions waiting/ }).getAttribute('href')).toBe('#health/meds')
    expect(screen.getByRole('link', { name: /^Food and salt/ }).getAttribute('href')).toBe('#health/nutrition')
    expect(screen.getByRole('link', { name: /^Progress/ }).getAttribute('href')).toBe('#health/nudge')
    expect(screen.getByTestId('member-footer').textContent).toBe("You can see Ma but not log for them. Only the family owner can make you a carer with edit access, and only for a person with no login.")
    expect(screen.getByTestId('member-footer').textContent).not.toMatch(/share/i)
  })
  it.each([
    [true, 'u2', "Ma has their own login, so only Ma can log."],
    [true, null, "You can see Ma's records. Logging for Ma needs a carer with edit access."]
  ])('owner=%s login=%s gives the true sentence', async (owner, login, text) => {
    mem.owner = owner; roster.login = login
    render(<MemberHealth id="ma" />)
    await waitFor(() => expect(screen.getByTestId('member-footer').textContent).toBe(text))
  })
  it('a non-owner admin gets the non-owner sentence even when the person has a login', async () => {
    mem.owner = false; roster.login = 'u2'
    render(<MemberHealth id="ma" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByTestId('member-footer').textContent).toMatch(/^You can see Ma but not log for them\. Only the family owner/)
  })
  it('shows the lock reason when given, and no footer when you can mark', () => {
    st.lockReason = 'Ask her.'
    const { rerender } = render(<MemberHealth id="ma" />)
    expect(screen.getByTestId('member-footer').textContent).toBe('Ask her.')
    st.canMark = true
    rerender(<MemberHealth id="ma" />)
    expect(screen.queryByTestId('member-footer')).toBeNull()
    expect(screen.getByTestId('member-bar').textContent).toContain('Viewing Ma · you can log for them') // the rows open screens where they can log
  })
  it('taken and skipped read as words', () => {
    today.doses = [{ key: 'a', name: 'Aspirin', slot: '08:00', state: 'taken' }, { key: 'b', name: 'Bisoprolol', slot: '08:00', state: 'skipped' }]
    render(<MemberHealth id="ma" />)
    expect(screen.getByText('1 of 2 taken')).toBeTruthy()
    expect(screen.getByText('Taken')).toBeTruthy()
    expect(screen.getByText('Skipped')).toBeTruthy()
  })
  it('mount points the person choice at the member; Back to me resets it to me', () => {
    render(<MemberHealth id="ma" />)
    expect(setPersonId).toHaveBeenCalledWith('ma')
    fireEvent.click(screen.getByRole('link', { name: 'Back to me' }))
    expect(setPersonId).toHaveBeenLastCalledWith('me')
  })
  it('an admin gets Open the app as <name> next to Back to me and it calls the same switch; a non-admin has no such button', () => {
    const { rerender } = render(<MemberHealth id="ma" />)
    expect(screen.queryByTestId('member-open-app')).toBeNull()
    va.can = true
    rerender(<MemberHealth id="ma" />)
    const btn = within(screen.getByTestId('member-bar')).getByTestId('member-open-app')
    expect(btn.textContent).toBe('Open the app as Ma')
    expect(within(screen.getByTestId('member-bar')).getByRole('link', { name: 'Back to me' })).toBeTruthy()
    fireEvent.click(btn)
    expect(va.go).toHaveBeenCalledWith('ma')
    va.err = 'Could not switch. Check your internet and try again.'
    rerender(<MemberHealth id="ma" />)
    expect(screen.getByRole('alert').textContent).toBe('Could not switch. Check your internet and try again.')
  })
  it('while viewing as someone the page link reads Back to Health, so the bar keeps the only Back to me', () => {
    hp.acting = true
    render(<MemberHealth id="ma" />)
    expect(screen.queryByRole('link', { name: 'Back to me' })).toBeNull()
    expect(within(screen.getByTestId('member-bar')).getByRole('link', { name: 'Back to Health' }).getAttribute('href')).toBe('#health')
  })
  it('an id you cannot see says so and offers Back to me', () => {
    render(<MemberHealth id="zz" />)
    expect(screen.getByText('You cannot see this person')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to me' })).toBeTruthy()
    expect(setPersonId).not.toHaveBeenCalledWith('zz')
  })
})
