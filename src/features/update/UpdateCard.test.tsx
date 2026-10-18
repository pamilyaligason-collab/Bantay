import 'fake-indexeddb/auto'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./plugin', () => ({ AppUpdater: { info: vi.fn().mockResolvedValue({ versionCode: 2000000, versionName: '2.0.0', canInstall: true }) } }))
import { resetJob, startJob } from './job'
import { UpdateCard } from './UpdateCard'
import { checkForUpdate } from './useUpdate'

const L = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/b.apk', sha256: 'a'.repeat(64), size: 9437184, minShell: 2000000, notes: 'x' }
afterEach(() => { cleanup(); resetJob(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true }) })
describe('UpdateCard', () => {
  it('starts no polling timer when no update is ready', () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    const { container } = render(<UpdateCard />)
    expect(container.textContent).toBe('')
    expect(spy).not.toHaveBeenCalled()
  })
  it('says Waiting for Wi-Fi only while the job waits, not merely on mobile data', async () => {
    await checkForUpdate(true, vi.fn().mockResolvedValue({ ok: true, json: async () => L }) as unknown as typeof fetch)
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true })
    render(<UpdateCard />)
    expect(await screen.findByText(/you can keep using Bantay/)).toBeTruthy()
    act(() => startJob(L, { download: vi.fn(), install: vi.fn() }, true))
    expect(await screen.findByText(/Waiting for Wi-Fi/)).toBeTruthy()
  })
})
