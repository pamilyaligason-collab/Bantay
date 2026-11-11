import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  p: { info: vi.fn(), download: vi.fn(), install: vi.fn(), addListener: vi.fn() },
  ln: { checkPermissions: vi.fn(), schedule: vi.fn(), addListener: vi.fn() }
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: h.ln }))
vi.mock('./plugin', () => ({ AppUpdater: h.p }))
vi.mock('../sos/active', () => ({ loadActive: () => Promise.resolve(null) }))

import { db } from '../../db'
import { AUTO_AT_KEY, runAuto } from './autoUpdate'
import { resetJob } from './job'
import { checkForUpdate } from './useUpdate'

const APK = 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.9.0/bantay-2.9.0.apk'
const L = { versionCode: 2009000, versionName: '2.9.0', url: APK, sha256: 'a'.repeat(64), size: 15779070, minShell: 2000000, notes: 'n' }

describe('cold start: App open check and runAuto together (real checkForUpdate, mocked fetch)', () => {
  beforeEach(async () => {
    await db.kv.clear(); vi.clearAllMocks(); resetJob()
    h.p.info.mockResolvedValue({ versionCode: 2008000, versionName: '2.8.0', canInstall: true, silentInstall: true })
    h.p.download.mockResolvedValue({ path: '/cache/update/bantay.apk' })
    h.p.addListener.mockResolvedValue({ remove: () => undefined })
    h.ln.checkPermissions.mockResolvedValue({ display: 'granted' })
    h.ln.schedule.mockResolvedValue(undefined)
  })
  it('runAuto waits for the in-flight check, sees the real latest.json and starts the download', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    vi.stubGlobal('fetch', vi.fn(async () => { await gate; return { ok: true, json: async () => L } }))
    h.p.install.mockResolvedValue({ status: 'success' })
    const open = checkForUpdate() // App's check on open, still waiting for the network
    const auto = runAuto(Date.now()) // startAuto fires in the same tick
    release()
    const [, d] = await Promise.all([open, auto])
    expect(d.kind).toBe('download')
    expect(h.p.download).toHaveBeenCalledTimes(1)
    expect(h.p.install).toHaveBeenCalledWith({ path: '/cache/update/bantay.apk', silent: true })
    expect(typeof (await db.kv.get(AUTO_AT_KEY))?.value).toBe('number')
  })
  it('pending user action: no install box (needs_tap), one notice, one silent install call only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => L })))
    h.p.install.mockResolvedValue({ status: 'needs_tap' })
    await runAuto(Date.now())
    expect(h.p.install).toHaveBeenCalledTimes(1)
    expect(h.p.install.mock.calls[0]![0].silent).toBe(true)
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
  })
  it('old shell (info() has no silentInstall): notice only, download and install never called', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => L })))
    h.p.info.mockResolvedValue({ versionCode: 2008000, versionName: '2.8.0', canInstall: true })
    await runAuto(Date.now())
    expect(h.p.download).not.toHaveBeenCalled()
    expect(h.p.install).not.toHaveBeenCalled()
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
  })
  it('new shell, pending result: needs_tap, nothing opened, remembered for that version', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => L })))
    h.p.install.mockResolvedValue({ status: 'needs_tap' })
    await runAuto(Date.now())
    expect((await db.kv.get('update.needsTapFor'))?.value).toBe(2009000)
    await db.kv.delete(AUTO_AT_KEY)
    await runAuto(Date.now() + 7 * 3600_000)
    expect(h.p.download).toHaveBeenCalledTimes(1) // the second run went straight to the notice
    expect(h.p.install).toHaveBeenCalledTimes(1)
  })
  it('canInstall false: notice only, no download and no install call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => L })))
    h.p.info.mockResolvedValue({ versionCode: 2008000, versionName: '2.8.0', canInstall: false })
    await runAuto(Date.now())
    expect(h.p.download).not.toHaveBeenCalled()
    expect(h.p.install).not.toHaveBeenCalled()
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
  })
})
