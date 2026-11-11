import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ native: true, open: undefined as undefined | ((e: { url: string }) => void), launch: undefined as string | undefined, listen: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: m.listen.mockImplementation(async (_e: string, cb: (e: { url: string }) => void) => { m.open = cb; return { remove: async () => undefined } }),
    getLaunchUrl: async () => (m.launch ? { url: m.launch } : undefined)
  }
}))

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('setupRoute', () => {
  it('maps the setup link, with or without a path or query, to #setup/all', async () => {
    const { setupRoute } = await import('./deepLink')
    for (const u of ['ph.bantay.family://setup', 'ph.bantay.family://setup/', 'ph.bantay.family://setup?from=get', 'ph.bantay.family://setup#x']) expect(setupRoute(u)).toBe('#setup/all')
  })
  it('ignores the sign-in return, look-alike hosts and other schemes', async () => {
    const { setupRoute } = await import('./deepLink')
    for (const u of ['ph.bantay.family://auth-callback?code=1', 'ph.bantay.family://setupx', 'ph.bantay.family://setup.evil.test', 'https://bantay.pages.dev/#setup/all', '', 'ph.bantay.family:/setup']) expect(setupRoute(u)).toBeNull()
  })
})

describe('setup link on the phone', () => {
  beforeEach(() => { vi.resetModules(); m.listen.mockClear() })
  afterEach(() => { m.open = undefined; m.launch = undefined; location.hash = '' })

  it('a link that arrives while the app is open goes to #setup/all', async () => {
    await import('./deepLink'); await tick()
    expect(m.listen).toHaveBeenCalledWith('appUrlOpen', expect.any(Function))
    m.open!({ url: 'ph.bantay.family://setup' })
    expect(location.hash).toBe('#setup/all')
  })
  it('the sign-in return does not move the screen', async () => {
    await import('./deepLink'); await tick()
    m.open!({ url: 'ph.bantay.family://auth-callback?code=abc' })
    expect(location.hash).toBe('')
  })
  it('a link that started the app is read once at launch', async () => {
    m.launch = 'ph.bantay.family://setup'
    await import('./deepLink'); await tick(); await tick()
    expect(location.hash).toBe('#setup/all')
  })
  it('on the web it registers nothing', async () => {
    m.native = false; m.listen.mockClear()
    await import('./deepLink'); await tick()
    expect(m.listen).not.toHaveBeenCalled()
    m.native = true
  })
})
