import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ viewers: vi.fn(), set: vi.fn(), cands: vi.fn(), counts: vi.fn(), member: vi.fn(), self: { id: 'me-person' as string | null, ready: true }, carers: [] as string[] }))
vi.mock('./api', () => ({
  NOT_OWNER: 'Only the family owner can open this page. If that is you, check your signal.', personViewers: h.viewers, setShare: h.set, shareCandidatesFor: h.cands, shareCounts: h.counts,
  shareCopy: (r: string) => ({ offline: 'No signal. Try again when you are online.', refused: 'You cannot change that.', limit: 'You changed sharing a lot. Try again in an hour.' })[r]
}))
vi.mock('../setup/useProfile', () => ({ useSelfPerson: () => h.self, useSelfPersonId: () => h.self.id }))
vi.mock('../family/CarerCards', () => ({ useCarerIds: () => h.carers }))
vi.mock('../auth/session', () => ({ getMember: h.member }))
vi.mock('../records/useRecordsServer', () => ({ usePeople: () => [{ id: 'me-person', name: 'Rey Villar' }, { id: 'p-ma', name: 'Ma Villar' }] }))
import SharingRoute, { SharingScreen } from './SharingScreen'

const V = (o: Partial<{ carerUserId: string; displayName: string; canWrite: boolean; addedByAdmin: boolean; addedAt: string | null }> = {}) =>
  ({ carerUserId: 'u1', displayName: 'Ate Joy', canWrite: false, addedByAdmin: false, addedAt: '2026-10-25T01:00:00Z', ...o })

beforeEach(() => {
  for (const f of [h.viewers, h.set, h.cands, h.counts, h.member]) f.mockReset()
  h.viewers.mockResolvedValue([V(), V({ carerUserId: 'u2', displayName: 'Kuya Ben', addedByAdmin: true, addedAt: '2026-10-21T01:00:00Z' })])
  h.cands.mockResolvedValue([{ carerUserId: 'u9', personId: 'p9', displayName: 'Tito Ramon' }, { carerUserId: 'u8', personId: 'p8', displayName: 'Lola Ising' }])
  h.set.mockResolvedValue('added')
  h.self = { id: 'me-person', ready: true }
  h.carers = []
  h.member.mockResolvedValue({ userId: 'u0', personId: 'me-person', role: 'admin', handle: null, isOwner: true })
})
afterEach(() => { cleanup(); location.hash = '' })

describe('Who can see my records (board D109Mine)', () => {
  it('shows the privacy line and the fixed owner line, each viewer, and who the owner added; no pending state', async () => {
    render(<SharingScreen />)
    expect(await screen.findByText(/^Only you, the family owner, and the people you or the family owner share with can see your records\./)).toBeTruthy()
    expect(screen.getByText("The family owner can see everyone's records.")).toBeTruthy()
    expect(screen.getByText('Ate Joy')).toBeTruthy()
    expect(screen.getByText('Can see your records')).toBeTruthy()
    expect(screen.getByText('Can see your records · added by the family owner')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Waiting for|family admins/)
    expect(screen.getByRole('link', { name: 'Back to Privacy' }).getAttribute('href')).toBe('#privacy')
    expect(h.viewers).toHaveBeenCalledWith('me-person')
  })
  it('says sharing works at once with no accept step, and that the owner can add it back', async () => {
    render(<SharingScreen />)
    await screen.findByText('Ate Joy')
    expect(screen.queryByText('Recent changes')).toBeNull()
    expect(screen.getByText('Sharing works at once, with no accept step. You can stop it any time. The family owner can add it back, and you are told again.')).toBeTruthy()
  })
  it('a carer reads as a carer', async () => {
    h.viewers.mockResolvedValue([V({ canWrite: true })])
    render(<SharingScreen />)
    expect(await screen.findByText('Carer · gets missed-dose alerts')).toBeTruthy()
  })
  it('Stop asks first; Keep does nothing, Stop sharing calls share_set off and reloads', async () => {
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop sharing with Ate Joy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(h.set).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing with Ate Joy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(h.set).toHaveBeenCalledWith('me-person', 'u1', false)
    await waitFor(() => expect(h.viewers).toHaveBeenCalledTimes(2))
  })
  it('a refused change shows the plain refusal copy', async () => {
    h.set.mockResolvedValue('refused')
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop sharing with Ate Joy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
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
  it('Share with someone: pick a chip, there is no carer box, Allow sets the link at once (can_write false)', async () => {
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Share with someone/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Share with someone' })
    expect(h.cands).toHaveBeenCalledWith('me-person')
    const allow = within(dlg).getByRole('button', { name: 'Allow' }) as HTMLButtonElement
    expect(allow.disabled).toBe(true)
    expect(within(dlg).queryByRole('checkbox')).toBeNull()
    expect(dlg.textContent).not.toMatch(/carer|Only the family owner can turn this on/)
    expect(within(dlg).getByText(/Allowing works at once\./)).toBeTruthy()
    expect(dlg.textContent).not.toMatch(/Accept|sees nothing until/)
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Tito Ramon' }))
    expect(within(dlg).getByRole('button', { name: 'Tito Ramon' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Allow Tito Ramon' }))
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
    await userEvent.click(within(dlg).getByRole('button', { name: 'Allow Lola Ising' }))
    expect((await within(dlg).findByRole('alert')).textContent).toBe('You changed sharing a lot. Try again in an hour.')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
  it('an empty candidate list says everyone is already in', async () => {
    h.cands.mockResolvedValue([])
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Share with someone/ }))
    expect(await screen.findByText('Everyone in the family can already see your records.')).toBeTruthy()
  })
})

describe("Who can see Ma's records (#sharing/<personId>, board D109Person)", () => {
  it('the owner sees that person\'s list, asks the server about that person, and a Stop or an Allow acts on that person', async () => {
    render(<SharingScreen person="p-ma" />)
    expect(await screen.findByRole('heading', { name: "Who can see Ma's records" })).toBeTruthy()
    await screen.findByText('Ate Joy')
    expect(h.viewers).toHaveBeenCalledWith('p-ma')
    expect(screen.getAllByText('Can see the records')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Back to Who sees whom' }).getAttribute('href')).toBe('#sharing/all')
    expect(screen.queryByText("The family owner can see everyone's records.")).toBeNull() // the owner line is the person's own screen
    expect(screen.getByText(/Allowing works at once: medicines, doses, readings, papers, check-ins, food and phone health\. Never ID cards\./)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing with Ate Joy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(h.set).toHaveBeenCalledWith('p-ma', 'u1', false)
    await userEvent.click(screen.getByRole('button', { name: /Allow someone/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Allow someone' })
    expect(h.cands).toHaveBeenCalledWith('p-ma')
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Tito Ramon' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Allow Tito Ramon' }))
    expect(h.set).toHaveBeenCalledWith('p-ma', 'u9', true, false)
  })
  it('anyone but the owner is refused, and the server is never asked for that list', async () => {
    h.member.mockResolvedValue({ userId: 'u0', personId: 'me-person', role: 'admin', handle: null, isOwner: false })
    render(<SharingScreen person="p-ma" />)
    expect((await screen.findByRole('alert')).textContent).toBe('Only the family owner can open this page. If that is you, check your signal.')
    expect(h.viewers).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Allow someone/ })).toBeNull()
  })
  it('a member who cannot be read at all (offline, signed out) is refused with the check-your-signal words, not shown a list', async () => {
    h.member.mockRejectedValue(new Error('down'))
    render(<SharingScreen person="p-ma" />)
    expect((await screen.findByRole('alert')).textContent).toBe('Only the family owner can open this page. If that is you, check your signal.')
    expect(h.viewers).not.toHaveBeenCalled()
  })
  it('my own id is my own record: no owner check, the privacy lines show', async () => {
    h.member.mockResolvedValue({ userId: 'u0', personId: 'me-person', role: 'member', handle: null, isOwner: false })
    render(<SharingScreen person="me-person" />)
    expect(await screen.findByText("The family owner can see everyone's records.")).toBeTruthy()
    expect(h.member).not.toHaveBeenCalled()
  })
})

describe('a writer carer of a person with no login (D-109 fix 1)', () => {
  const notOwner = () => h.member.mockResolvedValue({ userId: 'u7', personId: 'me-person', role: 'member', handle: null, isOwner: false })
  it('opens that person\'s list when useCarerIds names them, and asks the server about them', async () => {
    notOwner(); h.carers = ['p-ma']
    render(<SharingScreen person="p-ma" />)
    expect(await screen.findByRole('heading', { name: "Who can see Ma's records" })).toBeTruthy()
    await screen.findByText('Ate Joy')
    expect(h.viewers).toHaveBeenCalledWith('p-ma')
  })
  it('the back link goes to Family for a carer, and to Who sees whom for the owner', async () => {
    notOwner(); h.carers = ['p-ma']
    const { unmount } = render(<SharingScreen person="p-ma" />)
    await screen.findByText('Ate Joy')
    expect(screen.getByRole('link', { name: 'Back to Family' }).getAttribute('href')).toBe('#family')
    expect(screen.queryByRole('link', { name: 'Back to Who sees whom' })).toBeNull()
    unmount(); cleanup()
    h.member.mockResolvedValue({ userId: 'u0', personId: 'me-person', role: 'admin', handle: null, isOwner: true })
    render(<SharingScreen person="p-ma" />)
    await screen.findByText('Ate Joy')
    expect(screen.getByRole('link', { name: 'Back to Who sees whom' }).getAttribute('href')).toBe('#sharing/all')
  })
  it('a person they do not care for is still refused', async () => {
    notOwner(); h.carers = ['p-other']
    render(<SharingScreen person="p-ma" />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Only the family owner can open this page\./)
    expect(h.viewers).not.toHaveBeenCalled()
  })
})

describe('a signed-in user with no person row (fix 4)', () => {
  it('says sharing is for people with their own page once the lookup is done, never endless Loading', async () => {
    h.self = { id: null, ready: true }
    render(<SharingScreen />)
    expect(await screen.findByText('Sharing is for people with their own page in Bantay.')).toBeTruthy()
    expect(screen.queryByText('Loading.')).toBeNull()
    expect(screen.queryByRole('button', { name: /Share with someone/ })).toBeNull()
    expect(h.viewers).not.toHaveBeenCalled()
  })
  it('still says Loading while the lookup has not finished', () => {
    h.self = { id: null, ready: false }
    render(<SharingScreen />)
    expect(screen.getByRole('status').textContent).toBe('Loading.')
    expect(screen.queryByText('Sharing is for people with their own page in Bantay.')).toBeNull()
  })
})

describe('carers on #sharing/<id> (fix 5)', () => {
  it('a can_write row has no Stop there, and the footer says a carer cannot be removed here; a read-only row keeps Stop', async () => {
    h.viewers.mockResolvedValue([V({ displayName: 'Ate Joy', canWrite: true }), V({ carerUserId: 'u2', displayName: 'Kuya Ben' })])
    render(<SharingScreen person="p-ma" />)
    await screen.findByText('Ate Joy')
    expect(screen.queryByRole('button', { name: 'Stop sharing with Ate Joy' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop sharing with Kuya Ben' })).toBeTruthy()
    expect(screen.getByText(/A carer who keeps the records cannot be removed here\./)).toBeTruthy()
  })
  it('on my own list a carer keeps its Stop (the person themself may)', async () => {
    h.viewers.mockResolvedValue([V({ canWrite: true })])
    render(<SharingScreen />)
    expect(await screen.findByRole('button', { name: 'Stop sharing with Ate Joy' })).toBeTruthy()
  })
})

describe('the share sheet result (fixes 6 and 7)', () => {
  it('updated counts as success: the sheet closes and the list reloads', async () => {
    h.set.mockResolvedValue('updated')
    render(<SharingScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Share with someone/ }))
    const dlg = await screen.findByRole('dialog')
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Tito Ramon' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Allow Tito Ramon' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.viewers).toHaveBeenCalledTimes(2)
  })
  it("for another person the sheet says they are told, or their carers if they have no login, and has no carer box", async () => {
    render(<SharingScreen person="p-ma" />)
    await userEvent.click(await screen.findByRole('button', { name: /Allow someone/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Allow someone' })
    expect(within(dlg).getByText(/They are told, or their carers if they have no login\./)).toBeTruthy()
    expect(within(dlg).queryByRole('checkbox')).toBeNull()
  })
})

describe('the #sharing route', () => {
  it('#sharing is my list, #sharing/<id> is that person, #sharing/all is the owner list', async () => {
    h.counts.mockResolvedValue(new Map())
    location.hash = '#sharing'
    const { unmount } = render(<SharingRoute />)
    expect(await screen.findByRole('heading', { name: 'Who can see my records' })).toBeTruthy()
    unmount(); location.hash = '#sharing/p-ma'
    const second = render(<SharingRoute />)
    expect(await screen.findByRole('heading', { name: "Who can see Ma's records" })).toBeTruthy()
    second.unmount(); location.hash = '#sharing/all'
    render(<SharingRoute />)
    expect(await screen.findByRole('heading', { name: 'Who sees whom' })).toBeTruthy()
  })
})
