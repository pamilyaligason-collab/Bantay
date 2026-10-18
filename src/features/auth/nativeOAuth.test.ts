import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ native: false, oauth: vi.fn(), exchange: vi.fn(), open: vi.fn(), close: vi.fn(), listen: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: m.listen } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: m.open, close: m.close } }))
vi.mock('./client', () => ({ supabase: { auth: { signInWithOAuth: m.oauth, exchangeCodeForSession: m.exchange } } }))

import { NATIVE_REDIRECT, handleAuthCallback } from './nativeOAuth'
import { signInWithGoogle } from './pinLogin'
import { passkeySupported } from './family'

beforeEach(() => {
  m.native = false
  for (const f of [m.oauth, m.exchange, m.open, m.close, m.listen]) f.mockReset()
  m.oauth.mockResolvedValue({ data: { url: 'https://accounts.example/auth' }, error: null })
  m.exchange.mockResolvedValue({ error: null })
  m.open.mockResolvedValue(undefined)
  m.close.mockResolvedValue(undefined)
})

describe('native Google sign-in', () => {
  it('native: custom-scheme redirect, no auto redirect, opens the Custom Tab', async () => {
    m.native = true
    expect(await signInWithGoogle()).toBeNull()
    expect(m.oauth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } })
    expect(m.open).toHaveBeenCalledWith({ url: 'https://accounts.example/auth' })
  })
  it('native: errors surface as the fixed message', async () => {
    m.native = true
    m.open.mockRejectedValue(new Error('x'))
    expect(await signInWithGoogle()).toBe('Could not start Google sign-in. Try again.')
    m.oauth.mockResolvedValue({ data: {}, error: null })
    expect(await signInWithGoogle()).toBe('Could not start Google sign-in. Try again.')
  })
  it('web: unchanged, never opens a browser tab', async () => {
    await signInWithGoogle()
    expect(m.oauth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
    expect(m.open).not.toHaveBeenCalled()
  })
})

describe('handleAuthCallback', () => {
  it('exchanges the code and closes the tab', async () => {
    expect(await handleAuthCallback(`${NATIVE_REDIRECT}?code=abc`)).toBeNull()
    expect(m.close).toHaveBeenCalled()
    expect(m.exchange).toHaveBeenCalledWith('abc')
  })
  it('ignores unrelated URLs', async () => {
    for (const u of ['ph.bantay.family://other?code=x', 'https://evil.example/auth-callback?code=x', 'ph.bantay.family://auth-callbackX?code=x']) {
      expect(await handleAuthCallback(u)).toBeNull()
    }
    expect(m.exchange).not.toHaveBeenCalled()
    expect(m.close).not.toHaveBeenCalled()
  })
  it('maps an error param and does not exchange', async () => {
    expect(await handleAuthCallback(`${NATIVE_REDIRECT}?error=access_denied&code=x`)).toBe('Google sign-in was cancelled. Try again.')
    expect(await handleAuthCallback(`${NATIVE_REDIRECT}#error=server_error&error_description=boom`)).toBe('Sign-in did not work. Try again.')
    expect(m.exchange).not.toHaveBeenCalled()
  })
  it('reports a failed exchange', async () => {
    m.exchange.mockResolvedValue({ error: { message: 'bad' } })
    expect(await handleAuthCallback(`${NATIVE_REDIRECT}?code=abc`)).toBe('Sign-in did not work. Try again.')
  })
  it('survives Browser.close rejecting', async () => {
    m.close.mockRejectedValue(new Error('none open'))
    expect(await handleAuthCallback(`${NATIVE_REDIRECT}?code=abc`)).toBeNull()
    expect(m.exchange).toHaveBeenCalledWith('abc')
  })
})

describe('passkeySupported', () => {
  it('is false on native', () => {
    m.native = true
    expect(passkeySupported()).toBe(false)
  })
})
