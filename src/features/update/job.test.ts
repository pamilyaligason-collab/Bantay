import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetOlder, getJob, resetJob, retryInstall, runJob, startJob } from './job'

const L = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/b.apk', sha256: 'a'.repeat(64), size: 9_437_184, minShell: 2000000, notes: 'x' }
const mk = (versionCode = 2000000) => ({
  info: vi.fn().mockResolvedValue({ versionCode, versionName: '', canInstall: true }),
  download: vi.fn().mockResolvedValue({ path: '/p' }),
  install: vi.fn().mockResolvedValue({ status: 'pending_user' }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() })
})
const conn = (type: string | undefined) => Object.defineProperty(navigator, 'connection', { value: type ? { type } : undefined, configurable: true })
const visible = () => document.dispatchEvent(new Event('visibilitychange'))

beforeEach(() => { resetJob(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }) })
afterEach(() => { resetJob(); vi.useRealTimers(); conn(undefined) })

describe('job: stuck pending', () => {
  it('on return to the app, a pending job whose versionCode went up is success', async () => {
    const api = mk(2000001)
    await runJob(L, api)
    expect(getJob().phase).toBe('pending')
    visible()
    await vi.advanceTimersByTimeAsync(2000)
    expect(getJob().phase).toBe('success')
  })
  it('on return with no install, pending falls back to idle and keeps the verified file', async () => {
    const api = mk(2000000)
    await runJob(L, api)
    visible()
    await vi.advanceTimersByTimeAsync(1999)
    expect(getJob().phase).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(getJob().phase).toBe('idle')
    await runJob(L, api)
    expect(api.download).toHaveBeenCalledTimes(1)
    expect(api.install).toHaveBeenCalledTimes(2)
  })
  it('retryInstall re-runs install on the verified file without downloading', async () => {
    const api = mk()
    await runJob(L, api)
    await retryInstall(api)
    expect(api.download).toHaveBeenCalledTimes(1)
    expect(api.install).toHaveBeenCalledTimes(2)
    expect(api.install).toHaveBeenLastCalledWith({ path: '/p' })
  })
})

describe('job: Wi-Fi wait', () => {
  it('waits on mobile data and starts by itself when the connection is not cellular', async () => {
    conn('cellular')
    const api = mk()
    startJob(L, api, true)
    expect(getJob().phase).toBe('waiting_wifi')
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.download).not.toHaveBeenCalled()
    conn('wifi')
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.download).toHaveBeenCalledTimes(1)
    expect(getJob().phase).toBe('pending')
  })
  it('Wi-Fi only off starts at once on mobile data', async () => {
    conn('cellular')
    const api = mk()
    startJob(L, api, false)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.download).toHaveBeenCalledTimes(1)
  })
})

describe('job: newer latest.json', () => {
  const newer = { ...L, versionCode: 2000002, url: L.url.replace('b.apk', 'c.apk') }
  it('forgets the file of the older version', async () => {
    const api = mk()
    api.install.mockResolvedValueOnce({ status: 'failure' })
    await runJob(L, api)
    expect(getJob().phase).toEqual({ error: 'install' })
    forgetOlder(newer)
    await runJob(newer, api)
    expect(api.download).toHaveBeenCalledTimes(2)
    expect(api.download).toHaveBeenLastCalledWith({ url: newer.url, sha256: newer.sha256, size: newer.size })
  })
  it('a waiting job switches to the newer version', async () => {
    conn('cellular')
    const api = mk()
    startJob(L, api, true)
    forgetOlder(newer)
    conn('wifi')
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.download).toHaveBeenCalledWith({ url: newer.url, sha256: newer.sha256, size: newer.size })
  })
})
