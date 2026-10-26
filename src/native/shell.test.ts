import { afterEach, describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ native: false, plugins: new Set<string>(), version: '2.3.0' as string | undefined, getInfo: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => cap.native, isPluginAvailable: (n: string) => cap.plugins.has(n) } }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: cap.getInfo } }))

const load = async () => { vi.resetModules(); const m = await import('./shell'); await m.initShell(); return m }
afterEach(() => { cap.native = false; cap.plugins.clear(); cap.version = '2.3.0'; cap.getInfo.mockReset() })

describe('shell feature detection (C2)', () => {
  it('web: no version, nothing at least, no plugin, no native call', async () => {
    cap.plugins.add('Call') // even if a name leaked in, the web has no shell
    const s = await load()
    expect(s.shellVersion()).toBeNull()
    expect(s.shellAtLeast('0.0.1')).toBe(false)
    expect(s.hasPlugin('Call')).toBe(false)
    expect(cap.getInfo).not.toHaveBeenCalled()
  })
  it('native: reads App.getInfo once and compares semver by number, not text', async () => {
    cap.native = true
    cap.getInfo.mockResolvedValue({ version: '2.10.1' })
    const s = await load()
    await s.initShell(); await s.initShell()
    expect(cap.getInfo).toHaveBeenCalledTimes(1)
    expect(s.shellVersion()).toBe('2.10.1')
    expect(s.shellAtLeast('2.3.0')).toBe(true) // 10 > 3, a string compare would say false
    expect(s.shellAtLeast('2.10.1')).toBe(true)
    expect(s.shellAtLeast('2.10.2')).toBe(false)
    expect(s.shellAtLeast('3.0.0')).toBe(false)
    expect(s.shellAtLeast('2')).toBe(true)
  })
  it('a release candidate suffix is ignored; a shell below 2.3.0 is refused', async () => {
    cap.native = true
    cap.getInfo.mockResolvedValue({ version: '2.3.0-rc' })
    const s = await load()
    expect(s.shellAtLeast('2.3.0')).toBe(true)
    cap.getInfo.mockResolvedValue({ version: '2.2.9' })
    expect((await load()).shellAtLeast('2.3.0')).toBe(false)
  })
  it('unknown version (plugin error or junk) is null and fails every check, never true', async () => {
    cap.native = true
    cap.getInfo.mockRejectedValue(new Error('no plugin'))
    let s = await load()
    expect(s.shellVersion()).toBeNull()
    expect(s.shellAtLeast('1.0.0')).toBe(false)
    cap.getInfo.mockResolvedValue({ version: 'banana' })
    s = await load()
    expect(s.shellVersion()).toBeNull()
    expect(s.shellAtLeast('0.0.1')).toBe(false)
    expect(s.shellAtLeast('x')).toBe(false)
  })
  it('hasPlugin follows isPluginAvailable on a native shell only', async () => {
    cap.native = true
    cap.getInfo.mockResolvedValue({ version: '2.3.0' })
    cap.plugins.add('SettingsOpener')
    const s = await load()
    expect(s.hasPlugin('SettingsOpener')).toBe(true)
    expect(s.hasPlugin('Call')).toBe(false)
    expect(s.hasPlugin('TextToSpeech')).toBe(false)
  })
})
