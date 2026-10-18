import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateSheet } from './UpdateSheet'
const latest = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/b.apk', sha256: 'a'.repeat(64), size: 9_437_184, minShell: 2000000, notes: 'Fixes' }
const mk = (over: Record<string, unknown> = {}, canInstall = true) => ({
  info: vi.fn().mockResolvedValue({ versionCode: 2000000, versionName: '2.0.0', canInstall }),
  openInstallPermission: vi.fn(), download: vi.fn(), install: vi.fn(),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }), ...over
})
afterEach(cleanup)
describe('UpdateSheet', () => {
  it('asks for install permission first when Bantay cannot install', async () => {
    const api = mk({}, false)
    render(<UpdateSheet latest={latest} api={api} />)
    expect(await screen.findByText(/Android asks once to let Bantay install updates/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(api.openInstallPermission).toHaveBeenCalled()
  })
  it('shows the damaged-download message on checksum failure', async () => {
    const api = mk({ download: vi.fn().mockRejectedValue(new Error('checksum')) })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(await screen.findByText('The download was damaged. Try again.')).toBeTruthy()
  })
  it('keys errors on err.code and tells how much space to free', async () => {
    const api = mk({ download: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'space' })) })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(await screen.findByText('Not enough space. Free up 18 MB and try again.')).toBeTruthy()
  })
  it('network failure copy, and Try again downloads again', async () => {
    const download = vi.fn().mockRejectedValue(new Error('network'))
    render(<UpdateSheet latest={latest} api={mk({ download })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(await screen.findByText('Download stopped. Try again when you have signal.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(download).toHaveBeenCalledTimes(2)
  })
  it('pending_user shows the Android box message', async () => {
    const api = mk({ download: vi.fn().mockResolvedValue({ path: '/p' }), install: vi.fn().mockResolvedValue({ status: 'pending_user' }) })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(await screen.findByText("Checked. Tap Update in Android's box.")).toBeTruthy()
  })
  it('installResult failure shows a retry; success closes the sheet', async () => {
    let cb: (r: { status: 'success' | 'failure' }) => void = () => {}
    const api = mk({
      download: vi.fn().mockResolvedValue({ path: '/p' }), install: vi.fn().mockResolvedValue({ status: 'pending_user' }),
      addListener: vi.fn().mockImplementation(async (ev: string, f: typeof cb) => { if (ev === 'installResult') cb = f; return { remove: vi.fn() } })
    })
    const onClose = vi.fn()
    render(<UpdateSheet latest={latest} api={api} onClose={onClose} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    await screen.findByText("Checked. Tap Update in Android's box.")
    const { act } = await import('@testing-library/react')
    await act(async () => cb({ status: 'failure' }))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    await act(async () => cb({ status: 'success' }))
    expect(onClose).toHaveBeenCalled()
  })
  it('progress reads Downloading X of Y MB', async () => {
    let prog: (p: { done: number; total: number }) => void = () => {}
    const api = mk({
      download: vi.fn().mockReturnValue(new Promise(() => {})),
      addListener: vi.fn().mockImplementation(async (ev: string, f: typeof prog) => { if (ev === 'progress') prog = f; return { remove: vi.fn() } })
    })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    const { act } = await import('@testing-library/react')
    await act(async () => prog({ done: 4_300_000, total: 9_437_184 }))
    expect(await screen.findByText('Downloading 4.1 of 9 MB')).toBeTruthy()
  })
})
