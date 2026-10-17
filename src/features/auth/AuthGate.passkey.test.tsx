import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cb: null as null | ((e: string, s: { user: { id: string } } | null) => void),
  session: null as null | { user: { id: string } },
  check: null as null | Promise<void>,
  cache: vi.fn(), rpc: vi.fn(async () => ({ error: null }))
}))
vi.mock('./client', () => ({
  supabase: {
    rpc: h.rpc,
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      onAuthStateChange: (cb: typeof h.cb) => { h.cb = cb; return { data: { subscription: { unsubscribe() {} } } } }
    }
  }
}))
vi.mock('./family', () => ({ get passkeyCheck() { return h.check }, cacheFamily: h.cache }))
vi.mock('../../screens/SignIn', () => ({ default: () => <p>signin</p> }))

import { AuthGate } from './AuthGate'

describe('AuthGate with a passkey check pending', () => {
  afterEach(() => { cleanup(); h.cache.mockClear(); h.rpc.mockClear(); h.check = null; localStorage.clear() })

  it('wrong person: the session is dropped, app never opens, family is not cached', async () => {
    h.session = { user: { id: 'u-wrong' } }
    h.check = new Promise<void>((r) => setTimeout(() => { h.session = null; r() }, 20))
    render(<AuthGate><p>app</p></AuthGate>)
    h.cb!('SIGNED_IN', h.session)
    await waitFor(() => expect(screen.getByText('signin')).toBeTruthy())
    expect(screen.queryByText('app')).toBeNull()
    expect(h.cache).not.toHaveBeenCalled()
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('right person: waits, then opens the app and caches', async () => {
    h.session = { user: { id: 'u-ok' } }
    h.check = new Promise<void>((r) => setTimeout(r, 20))
    render(<AuthGate><p>app</p></AuthGate>)
    h.cb!('SIGNED_IN', h.session)
    await waitFor(() => expect(screen.getByText('app')).toBeTruthy())
    expect(h.cache).toHaveBeenCalled()
  })
})
