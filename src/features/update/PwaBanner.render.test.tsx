import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { PwaBanner } from './PwaBanner'

const LATEST = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/bantay.apk' }
const step3 = () => screen.getByText(/^3\./)
// Settled: the first fetch resolved and its body parsed, then a later kv read finished, so the banner's state updates are applied (no sleeps).
const settled = () => act(async () => {
  try { await (await vi.mocked(fetch).mock.results[0]?.value)?.json() } catch { /* a bad body is the case under test */ }
  await db.kv.get('alerts.inapp.ok')
})

beforeEach(async () => {
  await db.outbox.clear()
  await db.kv.clear()
  await db.kv.put({ key: 'alerts.inapp.ok', value: true })
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15) Chrome/141')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => LATEST }))
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as typeof window.matchMedia
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('PwaBanner render', () => {
  it('hidden until in-app alerts exist (kv alerts.inapp.ok)', async () => {
    await db.kv.delete('alerts.inapp.ok')
    render(<PwaBanner />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await settled()
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull()
    await db.kv.put({ key: 'alerts.inapp.ok', value: true })
    expect(await screen.findByRole('button', { name: 'Later' })).toBeTruthy()
  })
  it('nothing waiting: all saved, step 3 enabled', async () => {
    render(<PwaBanner />)
    await screen.findByText('2. All saved to the family account')
    expect(step3().getAttribute('aria-disabled')).toBe('false')
  })
  it('waiting rows hold step 3; unknown-table rows are not counted', async () => {
    await db.outbox.add({ table: 'readings', op: 'insert', payload: {}, createdAt: 1, tries: 0 })
    await db.outbox.add({ table: 'not_syncable', op: 'insert', payload: {}, createdAt: 1, tries: 0 })
    render(<PwaBanner />)
    await screen.findByText('2. 1 entry still waiting, connect to send')
    expect(step3().getAttribute('aria-disabled')).toBe('true')
  })
  it('dead letters hold step 3 with the admin hint', async () => {
    await db.kv.put({ key: 'sync.dead', value: [{ table: 'readings', op: 'insert', clientId: null, code: 'x', at: 1, payload: {} }] })
    render(<PwaBanner />)
    await screen.findByText(/1 entry could not be sent\. Open the old app's sync screen or ask an admin/)
    expect(step3().getAttribute('aria-disabled')).toBe('true')
  })
  it('Later writes the kv and hides the banner', async () => {
    render(<PwaBanner />)
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))
    await waitFor(async () => expect(typeof (await db.kv.get('update.pwaLaterAt'))?.value).toBe('number'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Later' })).toBeNull())
  })
  it.each([
    ['404', { ok: false, json: async () => LATEST }],
    ['missing versionCode', { ok: true, json: async () => ({ url: 'x' }) }],
    ['non-integer versionCode', { ok: true, json: async () => ({ versionCode: '2', url: 'x' }) }],
    ['missing url', { ok: true, json: async () => ({ versionCode: 2 }) }],
    ['not json (SPA fallback)', { ok: true, json: async () => { throw new SyntaxError('x') } }]
  ])('renders nothing when /latest.json is bad: %s', async (_n, res) => {
    const f = vi.fn().mockResolvedValue(res)
    vi.stubGlobal('fetch', f)
    render(<PwaBanner />)
    await waitFor(() => expect(f).toHaveBeenCalledWith('/latest.json', expect.anything()))
    await settled()
    expect(screen.queryByRole('region', { name: 'Bantay is now an app' })).toBeNull()
  })
  it('renders nothing when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    render(<PwaBanner />)
    await settled()
    expect(screen.queryByRole('region', { name: 'Bantay is now an app' })).toBeNull()
  })
  it('shows the banner after a valid /latest.json', async () => {
    render(<PwaBanner />)
    expect(await screen.findByRole('region', { name: 'Bantay is now an app' })).toBeTruthy()
  })
})
