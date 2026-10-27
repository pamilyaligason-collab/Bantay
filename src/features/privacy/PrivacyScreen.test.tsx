import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({
  consent: vi.fn(), exp: vi.fn(), req: vi.fn(), cancel: vi.fn(), save: vi.fn()
}))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
vi.mock('./consent', async (orig) => ({ ...(await orig<typeof import('./consent')>()), ensureConsent: h.consent }))
vi.mock('./data', async (orig) => ({ ...(await orig<typeof import('./data')>()), exportMyData: h.exp, requestErasure: h.req, cancelErasure: h.cancel, saveJson: h.save }))
import PrivacyScreen, { PROCESSORS } from './PrivacyScreen'

beforeEach(async () => {
  await db.kv.clear()
  h.consent.mockReset().mockResolvedValue({ at: new Date(2026, 9, 26, 9).toISOString(), backfilled: false })
  h.exp.mockReset(); h.req.mockReset(); h.cancel.mockReset(); h.save.mockReset().mockReturnValue(true)
})
afterEach(cleanup)

describe('Privacy screen', () => {
  it('shows the date the member agreed, from people.consent_at', async () => {
    render(<PrivacyScreen />)
    expect(await screen.findByText('Agreed when you joined, 26 Oct')).toBeTruthy()
  })
  it('says so plainly when no agreement is recorded yet (never a made-up date)', async () => {
    h.consent.mockResolvedValue({ at: null, backfilled: false })
    render(<PrivacyScreen />)
    expect(await screen.findByText('Agreement not recorded yet')).toBeTruthy()
  })
  it('"Who can see my records" opens the server list (#sharing) with the one privacy line, and names nobody', async () => {
    render(<PrivacyScreen />)
    expect(await screen.findByText('Only you, the family admins, and the people you share with.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Who can see my records/ }).getAttribute('href')).toBe('#sharing')
    expect(document.body.textContent).not.toMatch(/Admins can see everything/)
  })
  it('the AI-off line promises only what is gated: Jack, photo reading and new scans', async () => {
    await db.kv.put({ key: 'privacy.ai', value: false })
    render(<PrivacyScreen />)
    const t = (await screen.findByText(/^Off\. /)).textContent!
    expect(t).toMatch(/Jack and photo reading are paused/)
    expect(t).toMatch(/scan from now on/)
    expect(t).not.toMatch(/Nothing is sent/)
  })
  it('lists exactly the processors of this build and none of Firebase, Sentry or an SMS gateway', async () => {
    render(<PrivacyScreen />)
    expect(PROCESSORS.map((p) => p.name)).toEqual(['Supabase', 'Open-Meteo and RainViewer', 'OpenRouter', 'Google Drive', 'Cloudflare Pages'])
    const text = (await screen.findByText('Where your data goes')).parentElement!.textContent!
    expect(text).toMatch(/about 1 km/)
    expect(text).toMatch(/zero data retention/)
    expect(text).not.toMatch(/Firebase|Sentry|SMS/i)
  })
  it('the AI switch starts on and is stored in kv privacy.ai', async () => {
    render(<PrivacyScreen />)
    const sw = await screen.findByRole('switch', { name: 'Use AI for Jack and photos' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await waitFor(async () => expect((await db.kv.get('privacy.ai'))?.value).toBe(false))
  })
  it('Download my data saves the export file', async () => {
    h.exp.mockResolvedValue({ ok: true, value: { people: [{ id: 'p1' }] } })
    render(<PrivacyScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Download my data/ }))
    await waitFor(() => expect(h.save).toHaveBeenCalledWith(expect.stringMatching(/^bantay-my-data-\d{4}-\d\d-\d\d\.json$/), { people: [{ id: 'p1' }] }))
    expect(await screen.findByText('Your file is downloading.')).toBeTruthy()
  })
  it('an export that fails says so and saves nothing', async () => {
    h.exp.mockResolvedValue({ ok: false, error: 'Could not reach the server. Try again when you have signal.' })
    render(<PrivacyScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Download my data/ }))
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy()
    expect(h.save).not.toHaveBeenCalled()
  })
  it('Delete my data asks first, then shows the 7-day undo; Undo cancels it', async () => {
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString()
    h.req.mockResolvedValue({ ok: true, value: until }); h.cancel.mockResolvedValue({ ok: true, value: null })
    render(<PrivacyScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Delete my data/ }))
    expect(h.req).not.toHaveBeenCalled() // the first tap only asks
    await userEvent.click(screen.getByRole('button', { name: 'Delete my data in 7 days' }))
    expect(await screen.findByText(/Your data will be deleted on/)).toBeTruthy()
    expect((await db.kv.get('privacy.erasure'))?.value).toBe(until)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Deletion cancelled. Your data stays.')).toBeTruthy()
    await waitFor(async () => expect((await db.kv.get('privacy.erasure'))?.value).toBeNull())
  })
  it('a deletion whose undo window has passed offers no Undo', async () => {
    await db.kv.put({ key: 'privacy.erasure', value: new Date(Date.now() - 3600_000).toISOString() })
    render(<PrivacyScreen />)
    expect(await screen.findByText('Your data is being deleted')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
  it('a failed request leaves nothing pending', async () => {
    h.req.mockResolvedValue({ ok: false, error: 'Could not reach the server. Try again when you have signal.' })
    render(<PrivacyScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Delete my data/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete my data in 7 days' }))
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy()
    expect(screen.queryByText(/will be deleted on/)).toBeNull()
  })
})
