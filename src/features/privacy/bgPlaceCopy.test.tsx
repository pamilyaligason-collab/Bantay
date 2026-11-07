import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ native: false, version: null as string | null, open: vi.fn() }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
vi.mock('./consent', async (orig) => ({ ...(await orig<typeof import('./consent')>()), ensureConsent: () => Promise.resolve({ at: null, backfilled: false }) }))
vi.mock('../safety/settingsOpener', () => ({ isNativeAndroid: () => h.native, SettingsOpener: { open: (...a: unknown[]) => h.open(...a) } }))
vi.mock('../../native/shell', () => ({
  initShell: () => Promise.resolve(),
  shellAtLeast: (v: string) => {
    if (h.version == null) return false
    const a = h.version.split('.').map(Number); const b = v.split('.').map(Number)
    for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
    return true
  }
}))
import PrivacyScreen, { PLACE_PRIVACY, PLACE_PRIVACY_BG } from './PrivacyScreen'

beforeEach(async () => { await db.kv.clear(); localStorage.setItem('bantay.flag.places', '1'); h.native = false; h.version = null; h.open.mockReset().mockResolvedValue({ opened: 'app-settings' }) })
afterEach(() => { cleanup(); localStorage.clear() })

describe('the background place sentence is true for each build (ML-12, ML-45)', () => {
  it('web: the plain line, no background sentence, no card', async () => {
    render(<PrivacyScreen />)
    expect((await screen.findByTestId('place-privacy')).textContent).toBe(PLACE_PRIVACY)
    expect(screen.queryByTestId('bg-place-card')).toBeNull()
    expect(document.body.textContent).not.toMatch(/in the background|Allow all the time/)
  })
  it('Android app 2.7.0: still the plain line, no card', async () => {
    h.native = true; h.version = '2.7.0'
    render(<PrivacyScreen />)
    expect((await screen.findByTestId('place-privacy')).textContent).toBe(PLACE_PRIVACY)
    expect(screen.queryByTestId('bg-place-card')).toBeNull()
  })
  it('Android app 2.8.0: the background line says the daily run shares battery and a check-in, never a new place; no card, no settings button (no location permission is asked, D-151)', async () => {
    h.native = true; h.version = '2.8.0'
    render(<PrivacyScreen />)
    const line = (await screen.findByTestId('place-privacy')).textContent
    expect(line).toBe(PLACE_PRIVACY_BG)
    expect(line).toContain('only the battery level and that the phone checked in, never a new place')
    expect(line).not.toMatch(/Allow all the time|renews the same latest point/)
    expect(screen.queryByTestId('bg-place-card')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
    expect(h.open).not.toHaveBeenCalled()
  })
  it('with the Family map off nothing about place shows, even on 2.8.0', async () => {
    h.native = true; h.version = '2.8.0'; localStorage.setItem('bantay.flag.places', '0')
    render(<PrivacyScreen />)
    await screen.findByText('Where your data goes')
    expect(screen.queryByTestId('place-privacy')).toBeNull()
    expect(screen.queryByTestId('bg-place-card')).toBeNull()
  })
})
