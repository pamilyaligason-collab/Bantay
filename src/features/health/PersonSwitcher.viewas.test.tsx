import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'member', log: vi.fn() }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [], selfId: null }) }))
vi.mock('../family/FmAvatar', () => ({ default: () => <span /> }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u', personId: 'me', role: h.role, handle: null, isOwner: true }), onAuthChange: () => () => undefined }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => 'me' }))
vi.mock('../admin/events', () => ({ track: async () => true }))
vi.mock('../admin/desk/viewAsData', () => ({ logViewAs: (...a: unknown[]) => h.log(...a), loadRoster: async () => null, visibleTo: () => ({ shown: [], hidden: [] }) }))
vi.mock('../admin/api', () => ({ listCarers: async () => ({ ok: true, data: [] }) }))
import { hdb } from '../records/store'
import { exitActing } from '../viewas/viewAs'
import { getActingPersonId, setActing } from '../viewas/store'
import { PersonSwitcher } from './PersonSwitcher'

const people = [{ id: 'me', name: 'Ana Reyes' }, { id: 'b', name: 'Ben Cruz' }, { id: 'c', name: 'Cora Lim' }, { id: 'sh', name: 'The Family', kind: 'shared' }]
const open = () => { render(<PersonSwitcher people={people} meId="me" personId="me" setPersonId={() => undefined} />); fireEvent.click(screen.getByRole('button', { name: /Me/ })); return screen.getByRole('dialog') }

beforeEach(async () => { exitActing(); h.role = 'admin'; h.log.mockReset(); h.log.mockResolvedValue(true); location.hash = '#health'; await hdb.people.clear(); await hdb.people.bulkPut([{ id: 'b', name: 'Ben Cruz' }, { id: 'c', name: 'Cora Lim' }]) })
afterEach(() => { cleanup(); exitActing() })

describe('PersonSwitcher View as button (D-125)', () => {
  it('admin: a View as button on every listed row but Me, with the whole-app label; the foot says what it does', async () => {
    const sheet = open()
    await waitFor(() => expect(within(sheet).getByTestId('viewas-open-b')).toBeTruthy())
    expect(within(sheet).queryByTestId('viewas-open-me')).toBeNull()
    expect(within(sheet).queryByTestId('viewas-open-sh')).toBeNull() // the shared account is not offered in the list, so no button
    expect(within(sheet).getByTestId('viewas-open-c').getAttribute('aria-label')).toBe('View the whole app as Cora')
    expect(within(sheet).getByText('View as opens every tab the way they see it, needs internet, and is recorded in the family history.')).toBeTruthy()
  })
  it('tap: enterActing once, sheet closes, hash goes to Today; a second tap while busy does nothing', async () => {
    let done!: (v: boolean) => void
    h.log.mockReturnValue(new Promise<boolean>((r) => { done = r }))
    const sheet = open()
    const btn = await within(sheet).findByTestId('viewas-open-b')
    fireEvent.click(btn); fireEvent.click(btn)
    await waitFor(() => expect(h.log).toHaveBeenCalledTimes(1))
    done(true)
    await waitFor(() => expect(location.hash).toBe('#today'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.log).toHaveBeenCalledTimes(1)
    expect(h.log).toHaveBeenCalledWith('b')
    expect(getActingPersonId()).toBe('b')
  })
  it('failure: stays, says so, hash unchanged', async () => {
    h.log.mockResolvedValue(false) // the audit row failed: no session
    const sheet = open()
    fireEvent.click(await within(sheet).findByTestId('viewas-open-b'))
    expect((await within(sheet).findByRole('alert')).textContent).toBe('Could not switch. Check your internet and try again.')
    expect(location.hash).toBe('#health')
    expect(getActingPersonId()).toBeNull()
  })
  it('tapping the row still opens the view-only member page', async () => {
    const sheet = open()
    fireEvent.click(within(sheet).getByText('Ben Cruz'))
    await waitFor(() => expect(location.hash).toBe('#health/member/b'))
    expect(h.log).not.toHaveBeenCalled()
  })
  it('member, or an admin already viewing as someone: no buttons and no foot sentence', async () => {
    h.role = 'member'
    let sheet = open()
    await new Promise((r) => setTimeout(r, 30))
    expect(within(sheet).queryByTestId('viewas-open-b')).toBeNull()
    expect(within(sheet).queryByText(/View as opens every tab/)).toBeNull()
    cleanup(); h.role = 'admin'; setActing({ personId: 'b', name: 'Ben', can: { log: false, edit: true, rollcall: false, mood: false, reason: null } })
    sheet = open()
    await new Promise((r) => setTimeout(r, 30))
    expect(within(sheet).queryByTestId('viewas-open-b')).toBeNull()
  })
})
