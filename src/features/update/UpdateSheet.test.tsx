import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetJob } from './job'
import { UpdateSheet } from './UpdateSheet'
const latest = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/b.apk', sha256: 'a'.repeat(64), size: 9_437_184, minShell: 2000000, notes: 'Fixes' }
const mk = (over: Record<string, unknown> = {}, canInstall = true) => ({
  info: vi.fn().mockResolvedValue({ versionCode: 2000000, versionName: '2.0.0', canInstall }),
  openInstallPermission: vi.fn(), download: vi.fn(), install: vi.fn(),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }), ...over
})
beforeEach(resetJob)
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('UpdateSheet', () => {
  it('start-update: names the new version, what the phone has, the size, and keeps the data promise', async () => {
    render(<UpdateSheet latest={latest} api={mk()} />)
    expect(await screen.findByRole('dialog', { name: 'Update Bantay to 2.0.1' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Bantay 2.0.1 is ready' })).toBeTruthy()
    expect(await screen.findByText('You have 2.0.0 · 9 MB · Wi-Fi recommended')).toBeTruthy()
    expect(screen.getByText('Fixes')).toBeTruthy()
    expect(screen.getByText('Your data stays safe. Android may ask once to allow the install.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Install update' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('leaves out "You have" when the shell version is unknown (a browser reports versionCode 0)', async () => {
    const api = mk({ info: vi.fn().mockResolvedValue({ versionCode: 0, versionName: 'web', canInstall: true }) })
    render(<UpdateSheet latest={latest} api={api} />)
    expect(await screen.findByText('9 MB · Wi-Fi recommended')).toBeTruthy()
  })
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
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    expect(await screen.findByText('The download was damaged. Try again.')).toBeTruthy()
  })
  it('keys errors on err.code and tells how much space to free', async () => {
    const api = mk({ download: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'space' })) })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    expect(await screen.findByText('Not enough space. Free up 18 MB and try again.')).toBeTruthy()
  })
  it('network failure copy, and Try again downloads again', async () => {
    const download = vi.fn().mockRejectedValue(new Error('network'))
    render(<UpdateSheet latest={latest} api={mk({ download })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    expect(await screen.findByText('Download stopped. Try again when you have signal.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(download).toHaveBeenCalledTimes(2)
  })
  it('pending_user shows the Android box message', async () => {
    const api = mk({ download: vi.fn().mockResolvedValue({ path: '/p' }), install: vi.fn().mockResolvedValue({ status: 'pending_user' }) })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    expect(await screen.findByText("Checked. Tap Update in Android's box.")).toBeTruthy()
  })
  it('pending view Try again reopens Android\'s box on the same file', async () => {
    const download = vi.fn().mockResolvedValue({ path: '/p' })
    const install = vi.fn().mockResolvedValue({ status: 'pending_user' })
    render(<UpdateSheet latest={latest} api={mk({ download, install })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    await screen.findByText("Checked. Tap Update in Android's box.")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(install).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledTimes(1)
  })
  it('installResult failure shows a retry; success closes the sheet', async () => {
    let cb: (r: { status: 'success' | 'failure' }) => void = () => {}
    const api = mk({
      download: vi.fn().mockResolvedValue({ path: '/p' }), install: vi.fn().mockResolvedValue({ status: 'pending_user' }),
      addListener: vi.fn().mockImplementation(async (ev: string, f: typeof cb) => { if (ev === 'installResult') cb = f; return { remove: vi.fn() } })
    })
    const onClose = vi.fn()
    render(<UpdateSheet latest={latest} api={api} onClose={onClose} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
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
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    const { act } = await import('@testing-library/react')
    await act(async () => prog({ done: 4_300_000, total: 9_437_184 }))
    expect(await screen.findByText('Downloading 4.1 of 9 MB')).toBeTruthy()
  })
  it('Hide keeps the download: reopening shows its progress and does not start another', async () => {
    const download = vi.fn().mockReturnValue(new Promise(() => {}))
    const api = mk({ download })
    const a = render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    await screen.findByText(/Downloading 0 of 9 MB/)
    a.unmount()
    render(<UpdateSheet latest={latest} api={api} />)
    expect(await screen.findByText(/Downloading 0 of 9 MB/)).toBeTruthy()
    expect(download).toHaveBeenCalledTimes(1)
  })
  it('install() throwing clears the file so Try again downloads again', async () => {
    const download = vi.fn().mockResolvedValue({ path: '/p' })
    const api = mk({ download, install: vi.fn().mockRejectedValue(new Error('busy')) })
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(download).toHaveBeenCalledTimes(2)
  })
  it('a failed install result keeps the file: Try again only installs', async () => {
    const download = vi.fn().mockResolvedValue({ path: '/p' })
    const install = vi.fn().mockResolvedValue({ status: 'failure' })
    render(<UpdateSheet latest={latest} api={mk({ download, install })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(download).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledTimes(2)
  })
  it('on mobile data with Wi-Fi only on it waits, and turning the switch off starts the download', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true })
    const download = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<UpdateSheet latest={latest} api={mk({ download })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install update' }))
    expect(await screen.findByText(/Waiting for Wi-Fi/)).toBeTruthy()
    expect(download).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('switch', { name: 'Download on Wi-Fi only' }))
    await screen.findByText('Downloading the update')
    expect(download).toHaveBeenCalledTimes(1)
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true })
  })
})
