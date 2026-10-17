import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cb: null as null | ((e: string, s: { user: { id: string } } | null) => void),
  session: null as null | { user: { id: string } },
  check: null as null | Promise<void>, real: false,
  pk: vi.fn(), out: vi.fn(async () => { h.session = null; return {} }), member: vi.fn(),
  cache: vi.fn(), rpc: vi.fn(async () => ({ error: null }))
}))
vi.mock('./client', () => ({
  supabase: {
    rpc: h.rpc,
    auth: {
      signInWithPasskey: h.pk, signOut: h.out,
      getSession: async () => ({ data: { session: h.session } }),
      onAuthStateChange: (cb: typeof h.cb) => { h.cb = cb; return { data: { subscription: { unsubscribe() {} } } } }
    }
  }
}))
vi.mock('./session', () => ({ getMember: h.member }))
vi.mock('./family', async () => {
  const actual = await vi.importActual<typeof import('./family')>('./family')
  return { get passkeyCheck() { return h.real ? actual.passkeyCheck : h.check }, cacheFamily: h.cache, signInWithPasskey: actual.signInWithPasskey }
})
vi.mock('../../screens/SignIn', () => ({ default: () => <p>signin</p> }))

import { AuthGate } from './AuthGate'
import { signInWithPasskey } from './family'

describe('AuthGate with a passkey check pending', () => {
  afterEach(() => { cleanup(); h.cache.mockClear(); h.rpc.mockClear(); h.check = null; h.real = false; h.pk.mockReset(); h.member.mockReset(); localStorage.clear() })

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

  describe('auth state change lands before the passkey ceremony resolves', () => {
    const run = async (who: string) => {
      h.real = true
      vi.stubGlobal('PublicKeyCredential', class {})
      Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true })
      h.session = { user: { id: 'u1' } }
      let done!: () => void
      h.pk.mockImplementation(() => new Promise((r) => { done = () => r({ error: null }) }))
      h.member.mockResolvedValue({ personId: who })
      render(<AuthGate><p>app</p></AuthGate>)
      const p = signInWithPasskey('p1')
      h.cb!('SIGNED_IN', h.session) // fires mid-ceremony, before getMember has even been asked
      await new Promise((r) => setTimeout(r, 10))
      expect(screen.queryByText('app')).toBeNull() // the gate is holding for the identity check
      expect(h.rpc).not.toHaveBeenCalled()
      done()
      return p
    }
    it('right person: gate waits, then opens', async () => {
      expect(await run('p1')).toBeNull()
      await waitFor(() => expect(screen.getByText('app')).toBeTruthy())
    })
    it('wrong person: signed out locally, app never opens', async () => {
      expect(await run('p2')).toContain('someone else')
      expect(h.out).toHaveBeenCalledWith({ scope: 'local' })
      await waitFor(() => expect(screen.getByText('signin')).toBeTruthy())
      expect(screen.queryByText('app')).toBeNull()
      expect(h.rpc).not.toHaveBeenCalled()
    })
  })
})
