import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { setZone } from '../time/zone'

const h = vi.hoisted(() => ({
  carers: [] as { person_id: string }[],
  prefs: null as { digest_on: boolean } | null,
  saveError: false,
  calls: [] as { fn: string; args: unknown }[],
  carersAsked: 0
}))
vi.mock('../auth/client', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({
        eq: () => (t === 'carers' ? (h.carersAsked++, Promise.resolve({ data: h.carers, error: null })) : { maybeSingle: () => Promise.resolve({ data: h.prefs, error: null }) })
      }),
      upsert: () => { throw new Error('carer_prefs has no write grant: the app must call the set_digest RPC (0039)') }
    }),
    rpc: (fn: string, args: unknown) => { h.calls.push({ fn, args }); return Promise.resolve({ data: h.saveError ? null : (args as { p_on: boolean }).p_on, error: h.saveError ? { code: '500' } : null }) }
  }
}))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p-me', role: 'member', handle: null }) }))

import DigestToggle from './DigestToggle'

beforeEach(async () => { h.carers = []; h.prefs = null; h.saveError = false; h.calls = []; h.carersAsked = 0; await db.kv.clear() })
afterEach(cleanup)

describe('DigestToggle', () => {
  it('shows nothing for someone who cares for nobody (only their own link does not count)', async () => {
    h.carers = [{ person_id: 'p-me' }]
    const { container } = render(<DigestToggle />)
    await waitFor(() => expect(h.carersAsked).toBe(1)) // the carers lookup has been answered: empty now means hidden, not loading
    await Promise.resolve()
    expect(container.textContent).toBe('')
  })

  it('shows the switch ON when there is no saved choice, with the line that alerts never stop', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    render(<DigestToggle />)
    const sw = await screen.findByRole('switch', { name: '8 PM summary' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Turning this off never stops missed-medicine or Unwell alerts.')).toBeTruthy()
  })

  it('says the 8 PM time on the member\'s own clock: Manila time, then Manila with the Texas time when the zone changes (winter: 8:00 PM Manila = 6:00 AM Chicago)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T03:00:00Z'))
    try {
      h.carers = [{ person_id: 'p-mom' }]
      render(<DigestToggle />)
      await screen.findByRole('switch', { name: '8 PM summary' })
      expect(screen.getByText('One calm note at 8:00 PM Manila time about who still has medicine to take.')).toBeTruthy()
      act(() => setZone('America/Chicago'))
      expect(screen.getByText('One calm note at 8:00 PM Manila time (6:00 AM Texas time) about who still has medicine to take.')).toBeTruthy()
    } finally { setZone(null); vi.useRealTimers() }
  })

  it('reads the saved choice from the server: off stays off', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    h.prefs = { digest_on: false }
    render(<DigestToggle />)
    expect((await screen.findByRole('switch', { name: '8 PM summary' })).getAttribute('aria-checked')).toBe('false')
  })

  it('turning it off calls the set_digest RPC with p_on false once (the real request shape), and the choice is cached', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    render(<DigestToggle />)
    fireEvent.click(await screen.findByRole('switch', { name: '8 PM summary' }))
    await waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0]).toEqual({ fn: 'set_digest', args: { p_on: false } }) // auth.uid() is the user: no user_id is sent
    expect(screen.getByRole('switch', { name: '8 PM summary' }).getAttribute('aria-checked')).toBe('false')
    await waitFor(async () => expect((await db.kv.get('digest.on'))?.value).toEqual({ userId: 'u1', on: false }))
  })

  it('a save that fails puts the switch back and says so (the server holds the choice)', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    h.saveError = true
    render(<DigestToggle />)
    fireEvent.click(await screen.findByRole('switch', { name: '8 PM summary' }))
    expect((await screen.findByRole('status')).textContent).toBe('Could not save. Try again when you are online.')
    expect(screen.getByRole('switch', { name: '8 PM summary' }).getAttribute('aria-checked')).toBe('true')
  })
})
