import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  viewers: vi.fn(), set: vi.fn(), cands: vi.fn(), offers: vi.fn(), accept: vi.fn()
}))
// No importActual: api.ts re-exports AcceptCard, which imports api (a cycle the mock factory cannot wait on). The copy strings are api.test.ts's job.
vi.mock('./api', () => ({
  myViewers: h.viewers, setShare: h.set, shareCandidates: h.cands, pendingOffers: h.offers, answerShare: h.accept,
  shareCopy: (r: string) => ({ offline: 'No signal. Try again when you are online.', refused: 'You cannot change that.', limit: 'You changed sharing a lot. Try again in an hour.' })[r]
}))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'me-person' }))
import { AcceptCard } from './AcceptCard'
import { SharingScreen } from './SharingScreen'

const V = (o: Partial<{ carerUserId: string; displayName: string; canWrite: boolean; pending: boolean; addedByAdmin: boolean; addedAt: string | null }> = {}) =>
  ({ carerUserId: 'u1', displayName: 'Ate Joy', canWrite: false, pending: false, addedByAdmin: false, addedAt: '2026-10-25T01:00:00Z', ...o })

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.viewers.mockResolvedValue([V(), V({ carerUserId: 'u2', displayName: 'Kuya Ben', addedByAdmin: true, addedAt: '2026-10-21T01:00:00Z' }), V({ carerUserId: 'u3', displayName: 'Rhea', pending: true })])
  h.cands.mockResolvedValue([{ carerUserId: 'u9', personId: 'p9', displayName: 'Tito Ramon' }, { carerUserId: 'u8', personId: 'p8', displayName: 'Lola Ising' }])
  h.set.mockResolvedValue('pending')
  localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'pX', displayName: 'Mama', handle: null, provider: 'pin' }]))
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('Who can see my records', () => {
  it('shows the one privacy line, each viewer, and "Waiting for X to accept" for a pending offer', async () => {
    render(<SharingScreen />)
    expect(await screen.findByText('Only you, the family admins, and the people you share with can see your records.')).toBeTruthy()
    expect(screen.getByText('Ate Joy')).toBeTruthy()
    expect(screen.getAllByText(/Can see your records/)).toHaveLength(2)
    expect(screen.getByText(/added by an admin/)).toBeTruthy()
    expect(screen.getByText('Waiting for Rhea to accept')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Privacy' }).getAttribute('href')).toBe('#privacy')
  })
  it('has no Recent changes list (it could not show removals); it says admins can set who sees records and the member can stop it', async () => {
    render(<SharingScreen />)
    await screen.findByText('Ate Joy')
    expect(screen.queryByText('Recent changes')).toBeNull()
    expect(screen.getByText('The family admins can set who sees your records. You will be told, and you can stop it here.')).toBeTruthy()
  })
  it('an offer an admin made on my records shows as waiting and can be cancelled by me', async () => {
    h.viewers.mockResolvedValue([V({ carerUserId: 'u7', displayName: 'Tito Ramon', pending: true, addedByAdmin: true })])
    render(<SharingScreen />)
    expect(await screen.findByText('An admin offered this. Waiting for Tito Ramon to accept')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel the offer to Tito Ramon' }))
    expect(h.set).toHaveBeenCalledWith('me-person', 'u7', false)
  })
  it('Cancel on a pending offer calls share_set off for that carer and reloads', async () => {
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the offer to Rhea' }))
    expect(h.set).toHaveBeenCalledWith('me-person', 'u3', false)
    await waitFor(() => expect(h.viewers).toHaveBeenCalledTimes(2))
  })
  it('Stop asks first; Keep does nothing, Stop sharing calls share_set off', async () => {
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop sharing with Ate Joy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(h.set).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing with Ate Joy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(h.set).toHaveBeenCalledWith('me-person', 'u1', false)
  })
  it('a refused change shows the plain refusal copy', async () => {
    h.set.mockResolvedValue('refused')
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the offer to Rhea' }))
    expect((await screen.findByRole('alert')).textContent).toBe('You cannot change that.')
  })
  it('a failed load says so and offers Try again, never "nobody"', async () => {
    h.viewers.mockResolvedValueOnce(null)
    render(<SharingScreen />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/No signal/)
    expect(screen.queryByText('You have not shared with anyone yet.')).toBeNull()
    h.viewers.mockResolvedValue([])
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('You have not shared with anyone yet.')).toBeTruthy()
  })
  it('Share with someone: pick a family chip, the carer box is off and says only an admin can, Send offers (can_write false)', async () => {
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Share with someone/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Share with someone' })
    const send = within(dlg).getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    const box = within(dlg).getByRole('checkbox') as HTMLInputElement
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(false)
    expect(within(dlg).getByText('Only an admin can turn this on.')).toBeTruthy()
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Tito Ramon' }))
    expect(within(dlg).getByRole('button', { name: 'Tito Ramon' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send to Tito Ramon' }))
    expect(h.set).toHaveBeenCalledWith('me-person', 'u9', true, false)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.viewers).toHaveBeenCalledTimes(2)
  })
  it('the sheet keeps its place and shows the limit copy when the server says 53400', async () => {
    h.set.mockResolvedValue('limit')
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Share with someone/ }))
    const dlg = await screen.findByRole('dialog')
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Lola Ising' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send to Lola Ising' }))
    expect((await within(dlg).findByRole('alert')).textContent).toBe('You changed sharing a lot. Try again in an hour.')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
  it('an empty candidate list says everyone is already in', async () => {
    h.cands.mockResolvedValue([])
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Share with someone/ }))
    expect(await screen.findByText(/Everyone in the family can already see your records/)).toBeTruthy()
  })
})

describe('AcceptCard', () => {
  it('renders nothing without an offer', async () => {
    h.offers.mockResolvedValue([])
    const { container } = render(<AcceptCard />)
    await waitFor(() => expect(h.offers).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
  it('names the person from the family list, Accept answers true and the card goes', async () => {
    h.offers.mockResolvedValue([{ personId: 'pX', canWrite: false, addedAt: null }])
    h.accept.mockResolvedValue('ok')
    render(<AcceptCard />)
    expect(await screen.findByText('Mama can share their health records with you')).toBeTruthy()
    expect(screen.getByText(/You see nothing until you tap Accept\./)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(h.accept).toHaveBeenCalledWith('pX', true)
    await waitFor(() => expect(screen.queryByText(/can share their health records/)).toBeNull())
  })
  it('an unknown person is "Someone in your family"; No, thanks declines; a failed answer keeps the card and says why', async () => {
    h.offers.mockResolvedValue([{ personId: 'pZ', canWrite: true, addedAt: null }])
    h.accept.mockResolvedValueOnce('offline').mockResolvedValueOnce('limit')
    render(<AcceptCard />)
    expect(await screen.findByText('Someone in your family can share their health records with you')).toBeTruthy()
    expect(screen.getByText(/missed-dose alerts/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'No, thanks' }))
    expect(h.accept).toHaveBeenCalledWith('pZ', false)
    expect((await screen.findByRole('alert')).textContent).toMatch(/No signal/)
    expect(screen.getByText(/can share their health records/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'No, thanks' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/a lot/)) // a rate limit is not "no signal"
  })
})
