import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const state = { people: [person('p1', 'Maria Sample', true), person('p2', 'Ma Sample'), person('p3', 'Pa Sample')], last: null as Record<string, string> | null, writable: ['p2', 'p3'] as string[] }
vi.mock('../auth/client', () => ({ supabase: {} })) // signed in
vi.mock('../family/CarerCards', () => ({ useCarerIds: () => state.writable }))
vi.mock('../family/roster', async (orig) => ({ ...(await orig<object>()), useFamilyPeople: () => ({ people: state.people, selfId: 'p1' }), useCheckInsLoaded: () => state.last }))
vi.mock('../family/useFamilyScope', async (orig) => ({ ...(await orig<object>()), useLinkedPeople: () => state.people })) // you and your links; Health passes the ids it may show
vi.mock('../family/reportData', () => ({ useFlagLines: () => ({ p2: '2 to check', p3: '1 to check' }) }))
const act = { acting: false }
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<object>()), useActing: () => ({ acting: act.acting, personId: null, name: '' }) }))
const photos = vi.fn()
const msgs = vi.fn()
vi.mock('../family/memoriesApi', () => ({ listPhotos: (...a: unknown[]) => photos(...a) }))
vi.mock('../family/messagesApi', () => ({ listMessages: (...a: unknown[]) => msgs(...a) }))

import { FamilyHealthCard } from './FamilyHealthCard'

const now = new Date().toISOString()
beforeEach(() => {
  state.people = [person('p1', 'Maria Sample', true), person('p2', 'Ma Sample'), person('p3', 'Pa Sample')]
  act.acting = false
  state.last = { p1: now, p2: now }
  state.writable = ['p2', 'p3']
  photos.mockResolvedValue({ ok: true, data: [{ id: 'a' }, { id: 'b' }] })
  msgs.mockResolvedValue({ ok: true, data: [{ createdAt: now }, { createdAt: now }, { createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }] })
})
afterEach(cleanup)

describe('FamilyHealthCard', () => {
  it('S8: a lower-case name is written with capitals', () => {
    state.people = [person('p1', 'Maria Sample', true), person('p2', 'ana reyes')]
    render(<FamilyHealthCard ids={['p1', 'p2']} />)
    expect(screen.getByTestId('family-health').textContent).toContain('Ana Reyes')
    expect(screen.getByTestId('family-health').textContent).not.toContain('ana reyes')
  })
  it('header counts check-ins; doors to messages and the feed', async () => {
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('2 of 3 checked in today')
    expect(within(c).getByRole('link', { name: 'Share yours' }).getAttribute('href')).toBe('#family/messages')
    expect(within(c).getByRole('link', { name: 'All updates' }).getAttribute('href')).toBe('#family')
    expect(c.querySelectorAll('.fh-av .fm-av').length).toBeLessThanOrEqual(3)
  })
  it('a row per flagged person, Memories when online, messages in the last 24 h', async () => {
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('Ma Sample')
    expect(c.textContent).toContain('2 to check')
    await waitFor(() => expect(c.textContent).toContain('Recent photos'))
    await waitFor(() => expect(c.textContent).toContain('2 messages today'))
    expect(c.querySelector('input, textarea, button')).toBeNull() // read-only
  })
  it('a flagged row opens that person, Memories opens Memories, and Memories hides at 0 photos', async () => {
    const { unmount } = render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(within(c).getByRole('link', { name: /Ma Sample/ }).getAttribute('href')).toBe('#family/people/p2')
    await waitFor(() => expect(within(c).getByRole('link', { name: /Memories/ }).getAttribute('href')).toBe('#family/memories'))
    unmount()
    photos.mockResolvedValue({ ok: true, data: [] })
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    await waitFor(() => expect(photos).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByTestId('family-health').textContent).not.toContain('Memories')
  })
  it('a read-only link gets no flag line; a writer link does (D-109)', () => {
    state.writable = ['p2'] // Pa Sample is read-only
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('2 to check')
    expect(c.textContent).not.toContain('Pa Sample')
    expect(c.textContent).not.toContain('1 to check')
  })
  it('offline: only the check-in line and Share yours, nothing invented', async () => {
    photos.mockResolvedValue({ ok: false, error: 'unavailable' })
    msgs.mockResolvedValue({ ok: false, error: 'unavailable' })
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    await waitFor(() => expect(photos).toHaveBeenCalled())
    expect(c.textContent).not.toContain('Memories')
    expect(c.textContent).not.toContain('messages today')
    expect(within(c).getByRole('link', { name: 'Share yours' })).toBeTruthy()
  })
  it('hidden for one person', () => {
    state.people = [person('p1', 'Maria Sample', true)]
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    expect(screen.queryByTestId('family-health')).toBeNull()
  })
  it('only the people in ids appear: names, roll call, flag lines (1.H13)', async () => {
    render(<FamilyHealthCard ids={['p1', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('1 of 2 checked in today')
    expect(c.textContent).not.toContain('Ma Sample') // p2 is hidden and flagged
    expect(c.textContent).not.toContain('2 to check')
  })
  it('hidden when the filter leaves only me', () => {
    render(<FamilyHealthCard ids={['p1']} />)
    expect(screen.queryByTestId('family-health')).toBeNull()
  })
  it('while acting, Share yours is a view-only note, not a link', () => {
    act.acting = true
    render(<FamilyHealthCard ids={['p1', 'p2']} />)
    const c = screen.getByTestId('family-health')
    expect(within(c).queryByRole('link', { name: 'Share yours' })).toBeNull()
    expect(c.textContent).toContain('View only')
  })
})
