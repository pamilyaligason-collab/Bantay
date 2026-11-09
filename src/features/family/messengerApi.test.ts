import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake client: one table read and a captured auth listener, so the test can fire a sign-out.
const h = vi.hoisted(() => ({ listener: null as null | ((e: string) => void), rows: [{ id: 'p1', messenger: 'rey.villar' }] as { id: string; messenger: string | null }[], release: null as null | (() => void) }))
vi.mock('../auth/client', () => ({
  supabase: {
    auth: { onAuthStateChange: (f: (e: string) => void) => { h.listener = f; return { data: { subscription: { unsubscribe: () => undefined } } } } },
    from: () => ({ select: async () => { if (h.release === null) return { data: h.rows, error: null }; await new Promise<void>((r) => { h.release = r }); return { data: h.rows, error: null } } })
  }
}))

let api: typeof import('./messengerApi')
beforeEach(async () => {
  vi.resetModules()
  h.listener = null; h.release = null
  api = await import('./messengerApi')
})

describe('Messenger names and sign-out (ML-46)', () => {
  it('loads names, and a SIGNED_OUT event forgets every one so the next person on a shared phone starts empty', async () => {
    expect(await api.loadMessengers()).toEqual({ p1: 'rey.villar' })
    expect(await api.loadMessengers()).toEqual({ p1: 'rey.villar' }) // cached
    expect(h.listener).toBeTypeOf('function')
    h.rows = [{ id: 'p9', messenger: 'someone.else' }]
    h.listener!('TOKEN_REFRESHED')
    expect(await api.loadMessengers()).toEqual({ p1: 'rey.villar' }) // an ordinary token refresh keeps the cache
    h.listener!('SIGNED_OUT')
    expect(await api.loadMessengers()).toEqual({ p9: 'someone.else' }) // re-read for whoever is signed in now
  })

  it('a read that was in flight when the sign-out came never fills the cache afterwards', async () => {
    h.release = () => undefined
    const slow = api.loadMessengers() // starts, waits on the table
    await Promise.resolve()
    h.listener!('SIGNED_OUT')
    h.release?.()
    expect(await slow).toEqual({})
    h.release = null
    h.rows = [{ id: 'p2', messenger: 'next.person' }]
    expect(await api.loadMessengers()).toEqual({ p2: 'next.person' })
  })
})
