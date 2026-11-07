import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({
  rows: [] as { person_id: string; category: string; enabled: boolean }[], set: vi.fn(), owner: false,
  people: [] as { id: string; display_name: string; auth_user_id: string | null; photo_path: null; archived_at?: string | null; kind?: string | null }[]
}))
vi.mock('../auth/client', () => ({ supabase: { from: () => ({ select: () => Promise.resolve({ data: h.rows, error: null }) }) } }))
vi.mock('../auth/session', () => ({ getMember: () => Promise.resolve({ userId: 'u', personId: 'me', role: 'member', handle: null, isOwner: h.owner }) }))
vi.mock('../admin/desk/people', () => ({ loadPeople: () => Promise.resolve(h.people) }))
vi.mock('../sharing/api', async (orig) => ({ ...(await orig<typeof import('../sharing/api')>()), feedShareSet: h.set }))
import { placeSharingOn } from '../family/placeApi'
import { FeedSharesCard } from './feedShares'
import { feedSheetBody, feedSheetTitle, PLACE_BODY } from './FeedShareSheet'
import { FEED_PRIVACY, PLACE_PRIVACY, PLACE_PRIVACY_BG } from './PrivacyScreen'

const sw = (p: string, c: string) => screen.getByTestId(`feed-share-${p}-${c}`)
const ready = () => waitFor(() => expect((sw('me', 'place') as HTMLButtonElement).disabled).toBe(false))
beforeEach(async () => {
  await db.kv.clear(); localStorage.setItem('bantay.flag.places', '1')
  h.rows = []; h.owner = false; h.people = []; h.set.mockReset().mockResolvedValue('ok')
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('place switch in Share with the family (D-138)', () => {
  it('with only the places flag on, shows just the place switch, ON when the server holds no row', async () => {
    render(<FeedSharesCard selfId="me" />)
    await ready()
    expect(sw('me', 'place').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByTestId('feed-share-me-bp')).toBeNull()
    expect(screen.getByText('Share with the family: My place on.')).toBeTruthy()
  })
  it('an explicit off row shows OFF, and the phone caches it', async () => {
    h.rows = [{ person_id: 'me', category: 'place', enabled: false }]
    render(<FeedSharesCard selfId="me" />)
    await ready()
    expect(sw('me', 'place').getAttribute('aria-checked')).toBe('false')
    await waitFor(async () => expect(await placeSharingOn('me')).toBe(false))
  })
  it('turning off needs no sheet and updates the cache; turning on opens the place sheet', async () => {
    render(<FeedSharesCard selfId="me" />)
    await ready()
    await userEvent.click(sw('me', 'place'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.set).toHaveBeenCalledWith('me', 'place', false)
    await waitFor(() => expect(sw('me', 'place').getAttribute('aria-checked')).toBe('false'))
    expect(await placeSharingOn('me')).toBe(false)
    await userEvent.click(sw('me', 'place'))
    expect(screen.getByRole('dialog', { name: 'Share my place with the family?' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(h.set).toHaveBeenLastCalledWith('me', 'place', true)
    await waitFor(() => expect(sw('me', 'place').getAttribute('aria-checked')).toBe('true'))
    expect(await placeSharingOn('me')).toBe(true)
  })
  it('renders nothing with both flags off', () => {
    localStorage.setItem('bantay.flag.places', '0')
    render(<FeedSharesCard selfId="me" />)
    expect(screen.queryByTestId('feed-shares')).toBeNull()
  })
  it('the owner never sees a place switch for a person with no login', async () => {
    localStorage.setItem('bantay.flag.feed', '1')
    h.owner = true
    h.people = [{ id: 'n1', display_name: 'Lolo Nando', auth_user_id: null, photo_path: null }]
    render(<FeedSharesCard selfId="me" />)
    await waitFor(() => expect(screen.getByTestId('feed-share-n1-bp')).toBeTruthy())
    expect(screen.queryByTestId('feed-share-n1-place')).toBeNull()
    expect(screen.getByTestId('feed-share-me-place')).toBeTruthy()
  })
})

describe('place words (ML-45)', () => {
  it('the sheet states what is kept and who sees it', () => {
    expect(feedSheetTitle('place')).toBe('Share my place with the family?')
    expect(feedSheetBody('place')).toBe(PLACE_BODY)
    for (const w of ['latest point', 'never a trail', 'Family map', 'updates when Bantay opens', 'turn it off any time']) expect(PLACE_BODY).toContain(w)
  })
  it('the privacy screen line lists place: latest point only, whole family, Family map, on by default for sign-in, updated on open, off any time', () => {
    for (const w of ['Family map', 'sign in', 'shared with their family by default', 'updated when Bantay opens', 'off any time in Me, Privacy', 'exact latest place', 'Only the latest point', '7 days']) { expect(PLACE_PRIVACY).toContain(w); expect(PLACE_PRIVACY_BG).toContain(w) }
    expect(PLACE_PRIVACY).not.toMatch(/background|once a day/) // web and the 2.7.0 app do no background update (ML-12)
    for (const w of ['version 2.8.0', 'once a day in the background', 'only the battery level and that the phone checked in', 'never a new place', 'signing out']) expect(PLACE_PRIVACY_BG).toContain(w)
  })
  it('the feed line says off by default, per kind, who switches it on, and leaves place out', () => {
    for (const w of ['off by default', 'each kind', 'switches that kind on for themself', 'without a login the family owner may switch it on', 'switched off any time', 'place is separate']) expect(FEED_PRIVACY).toContain(w)
    expect(FEED_PRIVACY).not.toContain('only what that person switches on')
    expect(FEED_PRIVACY).not.toMatch(/check-ins, place/)
  })
  it('the public privacy page says the same', () => {
    const html = readFileSync('public/privacypolicy.html', 'utf8')
    expect(html).toContain(PLACE_PRIVACY_BG.replace(/'/g, '&#39;'))
    expect(html).toContain(FEED_PRIVACY)
    expect(html).toContain('Offline maps are on by default')
    expect(html).not.toContain('Offline maps off (the usual setting)')
    expect(html).toContain('MET Norway')
    expect(html).not.toContain('Your place, only when you turn on live location')
    expect(html).not.toMatch(/Nothing is shared by default\./)
  })
})
