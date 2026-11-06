import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ self: 'me' as string | null, acting: false, set: vi.fn(), sync: vi.fn(), rpc: vi.fn() }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a), auth: { signOut: () => Promise.resolve({}), getSession: () => Promise.resolve({ data: { session: null } }) } } }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => h.self }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: null, name: '' }) }))
vi.mock('../sharing/api', async (orig) => ({ ...(await orig<typeof import('../sharing/api')>()), feedShareSet: h.set }))
vi.mock('./placeApi', async (orig) => ({ ...(await orig<typeof import('./placeApi')>()), syncPlaceSwitch: h.sync }))
import PlaceNotice, { OFFLINE_NOTE, PLACE_NOTICE } from './PlaceNotice'
import { placeNoticeKey, placeSharingOn, putLivePlace } from './placeApi'

const shown = () => screen.queryByTestId('place-notice')
beforeEach(async () => {
  await db.kv.clear(); localStorage.setItem('bantay.flag.places', '1')
  h.self = 'me'; h.acting = false; h.set.mockReset().mockResolvedValue('ok'); h.sync.mockReset().mockResolvedValue(true)
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('first-open place notice (D-138)', () => {
  it('says exactly what the family can see, with Turn off and OK', async () => {
    render(<PlaceNotice />)
    expect((await screen.findByTestId('place-notice')).textContent).toContain('Your family can see where your phone was the last time Bantay was open. Turn off any time.')
    expect(PLACE_NOTICE).toBe('Your family can see where your phone was the last time Bantay was open. Turn off any time.')
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy()
  })
  it('shows once: OK hides it, a new mount does not bring it back', async () => {
    const { unmount } = render(<PlaceNotice />)
    await userEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(shown()).toBeNull()
    await waitFor(async () => expect((await db.kv.get(placeNoticeKey('me')))?.value).toBe(true))
    unmount()
    render(<PlaceNotice />)
    await new Promise((r) => setTimeout(r, 30))
    expect(shown()).toBeNull()
    expect(h.set).not.toHaveBeenCalled() // OK changes nothing on the server
  })
  it('Turn off switches place off on the server, caches it, and hides the card', async () => {
    render(<PlaceNotice />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }))
    expect(h.set).toHaveBeenCalledWith('me', 'place', false)
    await waitFor(() => expect(shown()).toBeNull())
    expect(await placeSharingOn('me')).toBe(false)
  })
  it('no point is sent before OK; after OK it is; Turn off writes the explicit off row and sends none', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null }); h.rpc.mockImplementation(rpc)
    const fix = { lat: 14.5995, lon: 120.9842, accuracy: 20, at: Date.UTC(2026, 10, 6, 4) }
    expect(await putLivePlace(fix, null, 'me')).toBe('skipped'); expect(rpc).not.toHaveBeenCalled()
    const { unmount } = render(<PlaceNotice />)
    await userEvent.click(await screen.findByRole('button', { name: 'OK' }))
    await waitFor(async () => expect(await putLivePlace(fix, null, 'me')).toBe('ok'))
    expect(rpc).toHaveBeenCalledTimes(1)
    unmount(); rpc.mockClear(); await db.kv.clear()
    render(<PlaceNotice />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }))
    await waitFor(async () => expect((await db.kv.get('place.sharing:me'))?.value).toBe(false))
    expect(await putLivePlace(fix, null, 'me')).toBe('skipped'); expect(rpc).not.toHaveBeenCalled()
  })
  it('Turn off offline keeps the card and says so', async () => {
    h.set.mockResolvedValue('offline')
    render(<PlaceNotice />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }))
    expect((await screen.findByRole('status')).textContent).toBe(OFFLINE_NOTE)
    expect(shown()).not.toBeNull()
    expect(await placeSharingOn('me')).toBe(true)
  })
  it('never shows with the flag off, with no person, while viewing as someone, or when the server says it is already off', async () => {
    localStorage.removeItem('bantay.flag.places')
    const a = render(<PlaceNotice />); await new Promise((r) => setTimeout(r, 30)); expect(shown()).toBeNull(); a.unmount()
    localStorage.setItem('bantay.flag.places', '1'); h.self = null
    const b = render(<PlaceNotice />); await new Promise((r) => setTimeout(r, 30)); expect(shown()).toBeNull(); b.unmount()
    h.self = 'me'; h.acting = true
    const c = render(<PlaceNotice />); await new Promise((r) => setTimeout(r, 30)); expect(shown()).toBeNull(); c.unmount()
    h.acting = false; h.sync.mockResolvedValue(false)
    render(<PlaceNotice />)
    await waitFor(() => expect(h.sync).toHaveBeenCalled())
    await waitFor(() => expect(shown()).toBeNull())
  })
  it('the notice is per person: after A says OK and signs out, B is asked and nothing is sent until B says OK', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null }); h.rpc.mockImplementation(rpc)
    const fix = { lat: 14.5995, lon: 120.9842, accuracy: 20, at: Date.UTC(2026, 10, 6, 4) }
    h.self = 'a'
    const a = render(<PlaceNotice />)
    await userEvent.click(await screen.findByRole('button', { name: 'OK' }))
    await waitFor(async () => expect(await putLivePlace(fix, null, 'a')).toBe('ok'))
    a.unmount(); rpc.mockClear()
    const { signOut } = await import('../auth/session'); await signOut() // the real sign-out clears the place keys
    expect(await db.kv.get(placeNoticeKey('a'))).toBeUndefined()
    h.self = 'b'
    render(<PlaceNotice />)
    expect(await screen.findByTestId('place-notice')).toBeTruthy()
    expect(await putLivePlace(fix, null, 'b')).toBe('skipped'); expect(rpc).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(async () => expect(await putLivePlace(fix, null, 'b')).toBe('ok'))
  })
  it('without a signOut, B on the same phone is still asked although A answered', async () => {
    await db.kv.put({ key: placeNoticeKey('a'), value: true })
    h.self = 'b'
    render(<PlaceNotice />)
    expect(await screen.findByTestId('place-notice')).toBeTruthy()
  })
})
