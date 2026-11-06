import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  rows: [] as { person_id: string; category: string; enabled: boolean }[],
  set: vi.fn(), owner: false, sel: null as null | (() => Promise<unknown>),
  people: [] as { id: string; display_name: string; auth_user_id: string | null; photo_path: null; archived_at?: string | null; kind?: string | null }[]
}))
vi.mock('../auth/client', () => ({ supabase: { from: () => ({ select: () => (h.sel ? h.sel() : Promise.resolve({ data: h.rows, error: null })) }) } }))
vi.mock('../auth/session', () => ({ getMember: () => Promise.resolve({ userId: 'u', personId: 'me', role: 'member', handle: null, isOwner: h.owner }) }))
vi.mock('../admin/desk/people', () => ({ loadPeople: () => Promise.resolve(h.people) }))
vi.mock('../sharing/api', async (orig) => ({ ...(await orig<typeof import('../sharing/api')>()), feedShareSet: h.set }))
import { CHECKING, FeedSharesCard, NOT_CHECKED, OFFLINE_NOTE } from './feedShares'
import { feedSheetBody, feedSheetTitle } from './FeedShareSheet'

const sw = (p: string, c: string) => screen.getByTestId(`feed-share-${p}-${c}`)
const ready = () => waitFor(() => expect((sw('me', 'bp') as HTMLButtonElement).disabled).toBe(false)) // the read answered
const online = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })

beforeEach(() => {
  localStorage.setItem('bantay.flag.feed', '1'); online(true)
  h.sel = null; h.rows = []; h.owner = false; h.people = []; h.set.mockReset().mockResolvedValue('ok')
})
afterEach(() => { cleanup(); localStorage.clear(); online(true) })

describe('Share with the family switches', () => {
  it('renders nothing with the feed flag off', () => {
    localStorage.removeItem('bantay.flag.feed')
    render(<FeedSharesCard selfId="me" />)
    expect(screen.queryByTestId('feed-shares')).toBeNull()
  })
  it('shows four switches, all off, and the summary line', async () => {
    render(<FeedSharesCard selfId="me" />)
    await ready()
    for (const c of ['bp', 'lab', 'photo', 'status']) expect(sw('me', c).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Share with the family: Blood pressure off, Lab results off, Photos off, Check-ins off.')).toBeTruthy()
  })
  it('turning on opens the sheet; the switch stays off until the call returns ok, and Not now changes nothing', async () => {
    let done!: (v: string) => void
    h.set.mockReturnValue(new Promise((r) => { done = r }))
    render(<FeedSharesCard selfId="me" />)
    await ready()
    await userEvent.click(sw('me', 'bp'))
    expect(screen.getByRole('dialog', { name: 'Share my blood pressure with the family?' })).toBeTruthy()
    expect(sw('me', 'bp').getAttribute('aria-checked')).toBe('false')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(h.set).toHaveBeenCalledWith('me', 'bp', true)
    expect(sw('me', 'bp').getAttribute('aria-checked')).toBe('false') // not set before the server answers
    done('ok')
    await waitFor(() => expect(sw('me', 'bp').getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByText('Share with the family: Blood pressure on, Lab results off, Photos off, Check-ins off.')).toBeTruthy()
    await userEvent.click(sw('me', 'lab'))
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(h.set).toHaveBeenCalledTimes(1)
    expect(sw('me', 'lab').getAttribute('aria-checked')).toBe('false')
  })
  it('turning off needs no sheet', async () => {
    h.rows = [{ person_id: 'me', category: 'photo', enabled: true }]
    render(<FeedSharesCard selfId="me" />)
    await ready()
    await waitFor(() => expect(sw('me', 'photo').getAttribute('aria-checked')).toBe('true'))
    await userEvent.click(sw('me', 'photo'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.set).toHaveBeenCalledWith('me', 'photo', false)
    await waitFor(() => expect(sw('me', 'photo').getAttribute('aria-checked')).toBe('false'))
  })
  it('a refused call leaves the switch off and says so', async () => {
    h.set.mockResolvedValue('limit')
    render(<FeedSharesCard selfId="me" />)
    await ready()
    await userEvent.click(sw('me', 'status'))
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect((await screen.findByRole('status')).textContent).toBe('You changed sharing a lot. Try again in an hour.')
    expect(sw('me', 'status').getAttribute('aria-checked')).toBe('false')
  })
  it('offline says Needs internet to change and calls nothing', async () => {
    online(false)
    render(<FeedSharesCard selfId="me" />)
    await ready()
    await userEvent.click(sw('me', 'bp'))
    expect(screen.getByText(OFFLINE_NOTE)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.set).not.toHaveBeenCalled()
  })
  it('sheet wording per category', () => {
    expect(feedSheetTitle('lab')).toBe('Share my lab results with the family?')
    expect(feedSheetTitle('photo')).toBe('Share my photos with the family?')
    expect(feedSheetTitle('status')).toBe('Share my check-ins with the family?')
    expect(feedSheetBody('bp')).toBe('Every blood pressure reading you save will show in the family feed, with the number and whether it is high. Everyone in the family sees it, not only the people who can see your records. You can turn it off any time; older posts leave their phones at the next sync.')
    expect(feedSheetBody('bp', 'Ma')).toContain('saved for Ma')
    expect(feedSheetBody('status')).toMatch(/Every check-in you make/)
    for (const c of ['bp', 'lab', 'photo', 'status'] as const) expect(feedSheetBody(c)).not.toMatch(/—/)
  })
})

describe('before the read answered (unknown is never off)', () => {
  it('while the read has not returned: switches disabled and mixed, no "off" anywhere, a tap changes nothing; then it settles', async () => {
    let answer!: (v: unknown) => void
    h.sel = () => new Promise((r) => { answer = r })
    render(<FeedSharesCard selfId="me" />)
    for (const c of ['bp', 'lab', 'photo', 'status']) {
      expect((sw('me', c) as HTMLButtonElement).disabled).toBe(true)
      expect(sw('me', c).getAttribute('aria-checked')).toBe('mixed')
    }
    expect(screen.getByTestId('feed-shares').textContent).toContain(CHECKING)
    expect(screen.getByTestId('feed-shares').textContent).not.toMatch(/\boff\b/)
    await userEvent.click(sw('me', 'bp'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.set).not.toHaveBeenCalled()
    answer({ data: [{ person_id: 'me', category: 'lab', enabled: true }], error: null })
    await ready()
    expect(sw('me', 'lab').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Share with the family: Blood pressure off, Lab results on, Photos off, Check-ins off.')).toBeTruthy()
  })
  it('a failed read (offline, no 0050): says it could not check, switches stay locked and mixed, a tap changes nothing, Try again reads again', async () => {
    h.sel = () => Promise.resolve({ data: null, error: { code: '42P01', message: 'missing' } })
    render(<FeedSharesCard selfId="me" />)
    expect(await screen.findByText(NOT_CHECKED)).toBeTruthy()
    for (const c of ['bp', 'lab', 'photo', 'status']) {
      expect((sw('me', c) as HTMLButtonElement).disabled).toBe(true)
      expect(sw('me', c).getAttribute('aria-checked')).toBe('mixed')
    }
    expect(screen.getByTestId('feed-shares').textContent).not.toMatch(/\boff\b/)
    await userEvent.click(sw('me', 'bp'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.set).not.toHaveBeenCalled()
    h.sel = null
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await ready()
    expect(sw('me', 'bp').getAttribute('aria-checked')).toBe('false')
  })
  it('a read that throws, or never answers within 10 s, also ends as could-not-check', async () => {
    h.sel = () => Promise.reject(new Error('net'))
    const a = render(<FeedSharesCard selfId="me" />)
    expect(await screen.findByText(NOT_CHECKED)).toBeTruthy()
    a.unmount()
    vi.useFakeTimers()
    try {
      h.sel = () => new Promise(() => undefined)
      render(<FeedSharesCard selfId="me" />)
      expect(screen.getByTestId('feed-shares').textContent).toContain(CHECKING)
      await act(async () => { await vi.advanceTimersByTimeAsync(10_100) })
      expect(screen.getByTestId('feed-shares').textContent).toContain(NOT_CHECKED)
      expect((sw('me', 'bp') as HTMLButtonElement).disabled).toBe(true)
    } finally { vi.useRealTimers() }
  })
})

describe('while a share call runs', () => {
  it('Not now is disabled and Share cannot be sent twice; Close lets the call finish cleanly: the switch and no leftover sheet', async () => {
    let done!: (v: string) => void
    h.set.mockReturnValue(new Promise((r) => { done = r }))
    render(<FeedSharesCard selfId="me" />)
    await ready()
    await userEvent.click(sw('me', 'bp'))
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect((screen.getByRole('button', { name: 'Not now' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((sw('me', 'bp') as HTMLButtonElement).disabled).toBe(true) // still locked until the answer
    expect(h.set).toHaveBeenCalledTimes(1)
    done('ok')
    await waitFor(() => expect(sw('me', 'bp').getAttribute('aria-checked')).toBe('true'))
    expect((sw('me', 'bp') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('owner rules (D-134)', () => {
  beforeEach(() => {
    h.owner = true
    h.people = [
      { id: 'me', display_name: 'Rey Owner', auth_user_id: 'u', photo_path: null },
      { id: 'ma', display_name: 'Ma', auth_user_id: null, photo_path: null },
      { id: 'papa', display_name: 'Papa', auth_user_id: 'u-papa', photo_path: null },
      { id: 'tita', display_name: 'Tita', auth_user_id: 'u-tita', photo_path: null },
      { id: 'old', display_name: 'Lolo', auth_user_id: null, photo_path: null, archived_at: '2026-01-01' },
      { id: 'fam', display_name: 'Shared', auth_user_id: null, photo_path: null, kind: 'shared' }
    ]
    h.rows = [{ person_id: 'papa', category: 'lab', enabled: true }]
  })
  it('sees four switches for a no-login person, with a sheet that names them', async () => {
    render(<FeedSharesCard selfId="me" />)
    await waitFor(() => expect(sw('ma', 'bp')).toBeTruthy())
    await ready()
    expect(screen.queryByTestId('feed-share-old-bp')).toBeNull()
    expect(screen.queryByTestId('feed-share-fam-bp')).toBeNull()
    await userEvent.click(sw('ma', 'bp'))
    expect(screen.getByRole('dialog', { name: "Share Ma's blood pressure with the family?" })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(h.set).toHaveBeenCalledWith('ma', 'bp', true)
  })
  it('for a login person shows only what is on, and only turns it off', async () => {
    render(<FeedSharesCard selfId="me" />)
    await waitFor(() => expect(sw('papa', 'lab').getAttribute('aria-checked')).toBe('true'))
    await ready()
    expect(screen.queryByTestId('feed-share-papa-bp')).toBeNull() // no on-switch for a person with a login
    expect(screen.queryByTestId('feed-share-tita-bp')).toBeNull() // nothing on: nothing shown
    await userEvent.click(sw('papa', 'lab'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.set).toHaveBeenCalledWith('papa', 'lab', false)
  })
  it('a member who is not the owner sees only their own four', async () => {
    h.owner = false
    render(<FeedSharesCard selfId="me" />)
    await waitFor(() => expect(sw('me', 'bp')).toBeTruthy())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('feed-share-ma-bp')).toBeNull()
  })
})
