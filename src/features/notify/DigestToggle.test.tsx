import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({
  carers: [] as { person_id: string }[],
  prefs: null as { digest_on: boolean } | null,
  saveError: false,
  upserts: [] as { row: Record<string, unknown>; opts: unknown }[]
}))
vi.mock('../auth/client', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({
        eq: () => (t === 'carers' ? Promise.resolve({ data: h.carers, error: null }) : { maybeSingle: () => Promise.resolve({ data: h.prefs, error: null }) })
      }),
      upsert: (row: Record<string, unknown>, opts: unknown) => { h.upserts.push({ row, opts }); return Promise.resolve({ error: h.saveError ? { code: '500' } : null }) }
    })
  }
}))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p-me', role: 'member', handle: null }) }))

import DigestToggle from './DigestToggle'

beforeEach(async () => { h.carers = []; h.prefs = null; h.saveError = false; h.upserts = []; await db.kv.clear() })
afterEach(cleanup)

describe('DigestToggle', () => {
  it('shows nothing for someone who cares for nobody (only their own link does not count)', async () => {
    h.carers = [{ person_id: 'p-me' }]
    const { container } = render(<DigestToggle />)
    await new Promise((r) => setTimeout(r, 50)) // nothing to wait on: the component stays empty
    expect(container.textContent).toBe('')
  })

  it('shows the switch ON when there is no saved choice, with the line that alerts never stop', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    render(<DigestToggle />)
    const sw = await screen.findByRole('switch', { name: '8 PM summary' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Turning this off never stops missed-medicine or Unwell alerts.')).toBeTruthy()
  })

  it('reads the saved choice from the server: off stays off', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    h.prefs = { digest_on: false }
    render(<DigestToggle />)
    expect((await screen.findByRole('switch', { name: '8 PM summary' })).getAttribute('aria-checked')).toBe('false')
  })

  it('turning it off upserts digest_on false for this user once, and the choice is cached', async () => {
    h.carers = [{ person_id: 'p-mom' }]
    render(<DigestToggle />)
    fireEvent.click(await screen.findByRole('switch', { name: '8 PM summary' }))
    await waitFor(() => expect(h.upserts).toHaveLength(1))
    expect(h.upserts[0]!.row).toMatchObject({ user_id: 'u1', digest_on: false })
    expect(h.upserts[0]!.opts).toEqual({ onConflict: 'user_id' })
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
