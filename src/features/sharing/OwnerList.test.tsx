import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ counts: vi.fn(), member: vi.fn() }))
vi.mock('./api', () => ({ NOT_OWNER: 'Only the family owner can open this page. If that is you, check your signal.', shareCounts: h.counts, shareCopy: () => 'No signal. Try again when you are online.' }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'rey' }))
vi.mock('../auth/session', () => ({ getMember: h.member }))
vi.mock('../records/useRecordsServer', () => ({
  usePeople: () => [{ id: 'rey', name: 'Rey Villar' }, { id: 'ma', name: 'Ma' }, { id: 'papa', name: 'Papa' }, { id: 'tita', name: 'Tita' }, { id: 'kuya', name: 'Kuya' }, { id: 'tablet', name: 'Shared Tablet', kind: 'shared' }]
}))
import { OwnerList } from './OwnerList'

beforeEach(() => {
  h.counts.mockReset().mockResolvedValue(new Map([['ma', 2], ['papa', 1]]))
  h.member.mockReset().mockResolvedValue({ userId: 'u0', personId: 'rey', role: 'admin', handle: null, isOwner: true })
})
afterEach(cleanup)

describe('Who sees whom (owner list, board D109Owner)', () => {
  it('lists everyone but the owner with "N can see" or "Only you", and each row opens that person', async () => {
    render(<OwnerList />)
    const list = await screen.findByTestId('owner-list')
    const rows = within(list).getAllByRole('listitem').map((r) => [r.querySelector('.rw-title')?.textContent, r.querySelector('.rw-value')?.textContent, r.querySelector('a')?.getAttribute('href')])
    expect(rows).toEqual([['Kuya', 'Only you', '#sharing/kuya'], ['Ma', '2 can see', '#sharing/ma'], ['Papa', '1 can see', '#sharing/papa'], ['Tita', 'Only you', '#sharing/tita']])
    expect(screen.getByText('You can see everyone. The app opens on your own page.')).toBeTruthy()
    expect(screen.getByText('Changes apply at once. A person with a login is told and can stop it. For someone with no login, the new viewer and the carers are told.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Family and sharing' }).getAttribute('href')).toBe('#me/family')
  })
  it('a member who is not the owner gets a plain refusal and the server is not asked', async () => {
    h.member.mockResolvedValue({ userId: 'u0', personId: 'rey', role: 'admin', handle: null, isOwner: false })
    render(<OwnerList />)
    expect((await screen.findByRole('alert')).textContent).toBe('Only the family owner can open this page. If that is you, check your signal.')
    expect(h.counts).not.toHaveBeenCalled()
  })
  it("asks the counts with the signed-in owner id so the owner's own links are left out", async () => {
    render(<OwnerList />)
    await screen.findByTestId('owner-list')
    expect(h.counts).toHaveBeenCalledWith('u0')
  })
  it('counts that could not be read say so with Try again, never "Only you" for everyone (ML-05)', async () => {
    h.counts.mockResolvedValueOnce(null)
    render(<OwnerList />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/No signal/)
    expect(screen.queryByText('Only you')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('2 can see')).toBeTruthy()
  })
})
