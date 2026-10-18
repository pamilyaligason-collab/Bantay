import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ native: false, status: vi.fn(), prompt: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native },
  registerPlugin: () => ({ status: (...a: unknown[]) => h.status(...a), prompt: (...a: unknown[]) => h.prompt(...a), openEnroll: vi.fn() })
}))
import { promptFingerprint, unlockMode } from './biometric'

describe('unlockMode on the web', () => {
  beforeEach(() => { h.native = false })
  it('uses passkey when the flag is set, else PIN', async () => {
    expect(await unlockMode({ passkeyFlag: true })).toBe('passkey')
    expect(await unlockMode({ passkeyFlag: false })).toBe('pin')
  })
})

describe('unlockMode in the APK', () => {
  beforeEach(() => { h.native = true; h.status.mockReset(); h.prompt.mockReset() })
  it('enrolled fingerprint -> fingerprint', async () => {
    h.status.mockResolvedValue({ available: true, enrolled: true })
    expect(await unlockMode({ passkeyFlag: false })).toBe('fingerprint')
  })
  it('available but nothing enrolled -> enrol-first', async () => {
    h.status.mockResolvedValue({ available: true, enrolled: false })
    expect(await unlockMode({ passkeyFlag: false })).toBe('enrol-first')
  })
  it('no sensor, or the plugin failing -> PIN', async () => {
    h.status.mockResolvedValue({ available: false, enrolled: false })
    expect(await unlockMode({ passkeyFlag: true })).toBe('pin')
    h.status.mockRejectedValue(new Error('x'))
    expect(await unlockMode({ passkeyFlag: true })).toBe('pin')
  })
  it('promptFingerprint: ok -> true, cancelled or failed -> false (never throws)', async () => {
    h.prompt.mockResolvedValueOnce({ ok: true })
    expect(await promptFingerprint('Open Bantay')).toBe(true)
    expect(h.prompt).toHaveBeenCalledWith({ title: 'Open Bantay' })
    h.prompt.mockRejectedValueOnce(new Error('cancelled'))
    expect(await promptFingerprint('Open Bantay')).toBe(false)
  })
  it("promptFingerprint: the native negative button ('use_pin') is reported as such", async () => {
    h.prompt.mockRejectedValueOnce(Object.assign(new Error('use_pin'), { code: undefined }))
    expect(await promptFingerprint('Open Bantay')).toBe('use_pin')
  })
})
