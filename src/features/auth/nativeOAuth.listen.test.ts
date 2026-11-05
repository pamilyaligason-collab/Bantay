import { afterEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ listen: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: m.listen } }))
vi.mock('@capacitor/browser', () => ({ Browser: { close: vi.fn() } }))
vi.mock('./client', () => ({ supabase: { auth: {} } }))

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('native sign-in return listener (plugin missing)', () => {
  afterEach(() => { m.listen.mockReset(); vi.resetModules() })

  it('a rejected App plugin leaves no unhandled rejection and the module still loads', async () => {
    const seen: unknown[] = []
    const onRej = (e: unknown) => seen.push(e)
    process.on('unhandledRejection', onRej)
    m.listen.mockRejectedValue(new Error('"App" plugin is not implemented on android'))
    const mod = await import('./nativeOAuth')
    await tick(); await tick()
    process.off('unhandledRejection', onRej)
    expect(m.listen).toHaveBeenCalledWith('appUrlOpen', expect.any(Function))
    expect(typeof mod.handleAuthCallback).toBe('function')
    expect(seen).toEqual([])
  })
})
