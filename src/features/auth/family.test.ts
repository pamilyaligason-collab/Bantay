import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ supabase: { rpc } }))

import { cacheFamily, forgetPhone, hasPasskeyFlag, initialsOf, loadFamily, setPasskeyFlag } from './family'

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
  it('hash errors are read and cleaned too', async () => {
    expect(await load('/#error=server_error&error_description=Something+broke')).toBe('Something broke')
    expect(location.hash).toBe('')
  })
})
