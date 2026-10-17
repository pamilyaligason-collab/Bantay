import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn(), pk: vi.fn(), out: vi.fn(), member: vi.fn() }))
const rpc = m.rpc
vi.mock('./client', () => ({ supabase: { rpc: m.rpc, auth: { signInWithPasskey: m.pk, signOut: m.out } } }))
vi.mock('./session', () => ({ getMember: m.member }))

import { signInWithPasskey, cacheFamily, forgetPhone, hasPasskeyFlag, initialsOf, loadFamily, setPasskeyFlag } from './family'

describe('family cache', () => {
  beforeEach(() => { localStorage.clear(); rpc.mockReset() })

  it('initials', () => {
    expect(initialsOf('Lola Rosa')).toBe('LR')
    expect(initialsOf('kuya')).toBe('K')
    expect(initialsOf('  ')).toBe('?')
  })
  it('empty and corrupt cache give no family', () => {
    expect(loadFamily()).toEqual([])
    localStorage.setItem('bantay.family', '{nope')
    expect(loadFamily()).toEqual([])
  })
  it('caches the picker list from the RPC, names and kinds only', async () => {
    rpc.mockResolvedValue({ data: [{ person_id: 'p1', display_name: 'Lola Rosa', handle: 'lola', provider: 'pin' }, { person_id: 'p2', display_name: 'Ate', handle: null, provider: 'google' }], error: null })
    await cacheFamily()
    expect(rpc).toHaveBeenCalledWith('family_profiles')
    expect(loadFamily()).toEqual([
      { personId: 'p1', displayName: 'Lola Rosa', handle: 'lola', provider: 'pin', initials: 'LR' },
      { personId: 'p2', displayName: 'Ate', handle: null, provider: 'google', initials: 'A' }
    ])
  })
  it('an RPC error keeps the old cache', async () => {
    localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p1', displayName: 'X', handle: null, provider: 'google', initials: 'X' }]))
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await cacheFamily()
    expect(loadFamily()).toHaveLength(1)
  })
  it('forget this phone clears the list and every passkey flag, nothing else', () => {
    localStorage.setItem('bantay.family', '[]')
    setPasskeyFlag('p1')
    localStorage.setItem('bantay.onboarded', '1')
    expect(hasPasskeyFlag('p1')).toBe(true)
    forgetPhone()
    expect(localStorage.getItem('bantay.family')).toBeNull()
    expect(hasPasskeyFlag('p1')).toBe(false)
    expect(localStorage.getItem('bantay.onboarded')).toBe('1')
  })
})

describe('urlSignInError', () => {
  const load = async (url: string) => {
    vi.resetModules()
    history.replaceState(null, '', url)
    return (await import('./urlError')).urlSignInError
  }
  it('no error: null, URL untouched', async () => {
    expect(await load('/app?x=1#family')).toBeNull()
    expect(location.search + location.hash).toBe('?x=1#family')
  })
  it('Signups not allowed maps to the invite message and the URL is cleaned', async () => {
    expect(await load('/?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance')).toBe('This Google account is not invited yet. Ask your family admin.')
    expect(location.search).toBe('')
  })
  it('never echoes URL text; unknown hook text is not an invite error', async () => {
    expect(await load('/?error=server_error&error_description=Click+evil.example+now')).toBe('Sign-in did not work. Try again.')
    expect(await load('/?error=server_error&error_description=webhook+misc')).toBe('Sign-in did not work. Try again.')
    expect(await load('/?error=access_denied&error_description=User+cancelled')).toBe('Google sign-in was cancelled. Try again.')
    expect(await load('/?error=server_error&error_description=Error+processing+hook')).toBe('This Google account is not invited yet. Ask your family admin.')
  })
  it('hash errors are read and cleaned too', async () => {
    expect(await load('/#error=server_error&error_description=Something+broke')).toBe('Sign-in did not work. Try again.')
    expect(location.hash).toBe('')
  })
})

describe('hardening', () => {
  beforeEach(() => { localStorage.clear(); rpc.mockReset() })
  it('loadFamily rebuilds entries from known fields only', () => {
    localStorage.setItem('bantay.family', JSON.stringify([
      { personId: 'p1', displayName: 'Lola Rosa', handle: 5, provider: 'admin', initials: '<img>', evil: 'x' },
      { personId: 'p2', displayName: '   ' }, { personId: 7, displayName: 'No' }, null
    ]))
    expect(loadFamily()).toEqual([{ personId: 'p1', displayName: 'Lola Rosa', handle: null, provider: 'google', initials: 'LR' }])
  })
  it('forgetPhone stops a cacheFamily already in flight from writing the list back', async () => {
    let done!: (v: unknown) => void
    rpc.mockReturnValue(new Promise((r) => { done = r }))
    const pending = cacheFamily()
    forgetPhone()
    done({ data: [{ person_id: 'p1', display_name: 'Lola', handle: null, provider: 'google' }], error: null })
    await pending
    expect(loadFamily()).toEqual([])
    rpc.mockResolvedValue({ data: [{ person_id: 'p1', display_name: 'Lola', handle: null, provider: 'google' }], error: null })
    await cacheFamily() // a later sign-in caches again
    expect(loadFamily()).toHaveLength(1)
  })
})

describe('signInWithPasskey', () => {
  beforeEach(() => {
    m.pk.mockReset(); m.out.mockReset(); m.member.mockReset()
    vi.stubGlobal('PublicKeyCredential', class {})
    Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true })
  })
  it('right person: signed in, no sign-out', async () => {
    m.pk.mockResolvedValue({ error: null }); m.member.mockResolvedValue({ personId: 'p1' })
    expect(await signInWithPasskey('p1')).toBeNull()
    expect(m.out).not.toHaveBeenCalled()
  })
  it('someone else is signed out locally with a clear message', async () => {
    m.pk.mockResolvedValue({ error: null }); m.member.mockResolvedValue({ personId: 'p2' })
    expect(await signInWithPasskey('p1')).toBe('That fingerprint belongs to someone else. Tap your own name.')
    expect(m.out).toHaveBeenCalledWith({ scope: 'local' })
  })
  it('a failed ceremony falls back to the PIN message', async () => {
    m.pk.mockResolvedValue({ error: { message: 'x' } })
    expect(await signInWithPasskey('p1')).toContain('Use your PIN instead')
  })
})
