import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./plugin', () => ({ AppUpdater: { info: vi.fn() } }))
import { db } from '../../db'
import { AppUpdater } from './plugin'
import { checkForUpdate } from './useUpdate'

const L = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/b.apk', sha256: 'a'.repeat(64), size: 9437184, minShell: 2000000, notes: 'x' }
const ok = () => vi.fn().mockResolvedValue({ ok: true, json: async () => L })
beforeEach(async () => {
  await db.kv.clear()
  vi.mocked(AppUpdater.info).mockResolvedValue({ versionCode: 2000000, versionName: '2.0.0', canInstall: true })
})

describe('checkForUpdate', () => {
  it('fetches same-origin /latest.json, then reuses the cached copy inside 6 h', async () => {
    const f = ok()
    const a = await checkForUpdate(false, f as unknown as typeof fetch)
    expect(f).toHaveBeenCalledWith('/latest.json', { cache: 'no-store' })
    expect(a.decision.kind).toBe('ready')
    const b = await checkForUpdate(false, f as unknown as typeof fetch)
    expect(f).toHaveBeenCalledTimes(1)
    expect(b.decision.kind).toBe('ready')
    await checkForUpdate(true, f as unknown as typeof fetch)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a failed fetch keeps the cached answer and flags failed', async () => {
    await checkForUpdate(false, ok() as unknown as typeof fetch)
    const s = await checkForUpdate(true, vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch)
    expect(s.failed).toBe(true)
    expect(s.decision.kind).toBe('ready')
  })
  it('web build never fetches', async () => {
    vi.mocked(AppUpdater.info).mockResolvedValue({ versionCode: 0, versionName: 'web', canInstall: false })
    const f = ok()
    const s = await checkForUpdate(true, f as unknown as typeof fetch)
    expect(f).not.toHaveBeenCalled()
    expect(s.decision.kind).toBe('none')
  })
})
