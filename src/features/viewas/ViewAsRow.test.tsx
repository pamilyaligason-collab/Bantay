import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ViewAsRow is mounted by L5 (Settings); this proves the component in isolation: admin-only, the picker, the audit row, the bar, Exit (D-99).
const h = vi.hoisted(() => ({
  member: { userId: 'u-admin', personId: 'p-admin', role: 'admin', handle: null } as { userId: string; personId: string; role: string; handle: null } | null,
  log: vi.fn(), carers: vi.fn(), people: [] as { id: string; name: string; isMe: boolean }[]
}))
vi.mock('../auth/session', () => ({ getMember: async () => h.member, getAccessToken: async () => 'tok', onAuthChange: () => () => undefined }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.member?.personId ?? null }))
vi.mock('../admin/events', () => ({ track: async () => true }))
vi.mock('../admin/desk/viewAsData', () => ({ logViewAs: (...a: unknown[]) => h.log(...a), loadRoster: async () => null, visibleTo: () => ({ shown: [], hidden: [] }) }))
vi.mock('../admin/api', () => ({ listCarers: () => h.carers() }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: h.people, selfId: 'p-admin' }) }))
import { hdb } from '../records/store'
import ViewAsBanner from './ViewAsBanner'
import ViewAsRow from './ViewAsRow'
import { getActingPersonId } from './store'
import { exitActing } from './viewAs'

const both = () => render(<><ViewAsRow /><ViewAsBanner /></>)

beforeEach(async () => {
  exitActing()
  h.member = { userId: 'u-admin', personId: 'p-admin', role: 'admin', handle: null }
  h.log.mockReset(); h.log.mockResolvedValue(true)
  h.carers.mockReset(); h.carers.mockResolvedValue({ ok: true, data: [] })
  h.people = [{ id: 'p-admin', name: 'Lloyd', isMe: true }, { id: 'p-mama', name: 'Mama', isMe: false }, { id: 'p-cache', name: 'Cached Only', isMe: false }]
  await hdb.people.clear(); await hdb.people.bulkPut([{ id: 'p-admin', name: 'Lloyd' }, { id: 'p-mama', name: 'Mama' }])
})
afterEach(() => { cleanup(); exitActing() })

describe('ViewAsRow in isolation', () => {
  it('renders nothing for a member', async () => {
    h.member = { userId: 'u-m', personId: 'p-m', role: 'member', handle: null }
    both()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('viewas-row')).toBeNull()
  })
  it('admin: row opens the picker with everyone known except the admin and anyone with no people row; picking writes one audit row and shows the bar; Exit clears it', async () => {
    both()
    fireEvent.click(within(await screen.findByTestId('viewas-row')).getByRole('button'))
    const sheet = await screen.findByRole('dialog', { name: 'View as' })
    expect(within(sheet).getByText('Needs internet to switch. Every view is recorded in the family history.')).toBeTruthy()
    expect(within(sheet).queryByRole('button', { name: 'Lloyd' })).toBeNull()
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Mama' })).toBeTruthy())
    expect(within(sheet).queryByRole('button', { name: 'Cached Only' })).toBeNull() // only in the sign-in cache: acting would end at once
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mama' }))
    await waitFor(() => expect(getActingPersonId()).toBe('p-mama'))
    expect(h.log).toHaveBeenCalledTimes(1)
    expect(h.log).toHaveBeenCalledWith('p-mama')
    const bar = await screen.findByTestId('viewas-bar')
    expect(bar.textContent).toContain('Acting as Mama')
    expect(bar.textContent).toContain('You can see Mama but not log for her. Ask her (or an admin) to make you a carer with edit access.') // C-9 copy, no carer link
    fireEvent.click(within(bar).getByRole('button', { name: 'Exit' }))
    expect(getActingPersonId()).toBeNull()
    expect(screen.queryByTestId('viewas-bar')).toBeNull()
  })
  it('offline / audit failure: the switch does not happen and the sheet says so', async () => {
    h.log.mockResolvedValue(false)
    both()
    fireEvent.click(within(await screen.findByTestId('viewas-row')).getByRole('button'))
    const sheet = await screen.findByRole('dialog', { name: 'View as' })
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Mama' }))
    await within(sheet).findByRole('alert')
    expect(getActingPersonId()).toBeNull()
  })
})
