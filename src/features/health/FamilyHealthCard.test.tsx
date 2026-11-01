import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const state = { people: [person('p1', 'Maria Sample', true), person('p2', 'Ma Sample'), person('p3', 'Pa Sample')], last: null as Record<string, string> | null }
vi.mock('../family/roster', async (orig) => ({ ...(await orig<object>()), useFamilyPeople: () => ({ people: state.people, selfId: 'p1' }), useCheckInsLoaded: () => state.last }))
vi.mock('../family/reportData', () => ({ useFlagLines: () => ({ p2: '2 to check' }) }))
const photos = vi.fn()
const msgs = vi.fn()
vi.mock('../family/memoriesApi', () => ({ listPhotos: (...a: unknown[]) => photos(...a) }))
vi.mock('../family/messagesApi', () => ({ listMessages: (...a: unknown[]) => msgs(...a) }))

import { FamilyHealthCard } from './FamilyHealthCard'

const now = new Date().toISOString()
beforeEach(() => {
  state.people = [person('p1', 'Maria Sample', true), person('p2', 'Ma Sample'), person('p3', 'Pa Sample')]
  state.last = { p1: now, p2: now }
  photos.mockResolvedValue({ ok: true, data: [{ id: 'a' }, { id: 'b' }] })
  msgs.mockResolvedValue({ ok: true, data: [{ createdAt: now }, { createdAt: now }, { createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }] })
})
afterEach(cleanup)

describe('FamilyHealthCard', () => {
  it('header counts check-ins; doors to messages and the feed', async () => {
    render(<FamilyHealthCard />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('2 of 3 checked in today')
    expect(within(c).getByRole('link', { name: 'Share yours' }).getAttribute('href')).toBe('#family/messages')
    expect(within(c).getByRole('link', { name: 'All updates' }).getAttribute('href')).toBe('#family')
    expect(c.querySelectorAll('.fh-av .fm-av').length).toBeLessThanOrEqual(3)
  })
  it('a row per flagged person, Memories when online, messages in the last 24 h', async () => {
    render(<FamilyHealthCard />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('Ma Sample')
    expect(c.textContent).toContain('2 to check')
    await waitFor(() => expect(c.textContent).toContain('Memories'))
    await waitFor(() => expect(c.textContent).toContain('2 messages today'))
    expect(c.querySelector('input, textarea, button')).toBeNull() // read-only
  })
  it('offline: only the check-in line and Share yours, nothing invented', async () => {
    photos.mockResolvedValue({ ok: false, error: 'unavailable' })
    msgs.mockResolvedValue({ ok: false, error: 'unavailable' })
    render(<FamilyHealthCard />)
    const c = screen.getByTestId('family-health')
    await waitFor(() => expect(photos).toHaveBeenCalled())
    expect(c.textContent).not.toContain('Memories')
    expect(c.textContent).not.toContain('messages today')
    expect(within(c).getByRole('link', { name: 'Share yours' })).toBeTruthy()
  })
  it('hidden for one person', () => {
    state.people = [person('p1', 'Maria Sample', true)]
    render(<FamilyHealthCard />)
    expect(screen.queryByTestId('family-health')).toBeNull()
  })
})
