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
  it('the OpenStreetMap line says offline maps are on by default (D-133)', () => {
    const w = PROCESSORS.find((p) => p.name === 'OpenStreetMap')!.what
    expect(w).toContain('Offline maps are on by default')
    expect(w).not.toContain('the usual setting')
  })
  it('the OpenStreetMap line names the offline barangay files and the credit, in the app credit format', () => {
    const w = PROCESSORS.find((p) => p.name === 'OpenStreetMap')!.what
    expect(w).toContain('Barangay names on Today'); expect(w).toContain('© OpenStreetMap contributors')
  })
  it('the feed paragraph shows only with the feed flag on', async () => {
    render(<PrivacyScreen />)
    await screen.findByText('Agreed when you joined, 26 Oct')
    expect(screen.queryByTestId('feed-privacy')).toBeNull()
    cleanup(); localStorage.setItem('bantay.flag.feed', '1')
    render(<PrivacyScreen />)
    expect(await screen.findByTestId('feed-privacy')).toBeTruthy()
    localStorage.removeItem('bantay.flag.feed')
  })
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
    expect(await screen.findByText('Only you, the family owner, and the people you or the family owner share with.')).toBeTruthy()
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
  it('lists exactly the processors of this build and none of Sentry or an SMS gateway', async () => {
    render(<PrivacyScreen />)
    expect(PROCESSORS.map((p) => p.name)).toEqual(['Supabase', 'Open-Meteo and Windy', 'ExchangeRate-API (open.er-api.com)', 'Wikipedia', 'Wikimedia Commons and news sites', 'YouTube', 'Love Radio, Easy Rock, DZRH, Home Radio and Magic 89.9', 'OpenStreetMap', 'Ventusky, HazardHunterPH and PAGASA Panahon', 'MedlinePlus', 'OpenRouter', 'Google Drive', 'Firebase Cloud Messaging (Google)', 'Cloudflare Pages'])
    const text = (await screen.findByText('Where your data goes')).parentElement!.textContent!
    expect(text).toMatch(/about 1 km/)
    expect(text).toMatch(/zero data retention/)
    expect(text).toContain('YouTube: picture previews load when a video card shows, so YouTube sees your internet address; the video loads only when you tap')
    expect(text).toContain('Love Radio, Easy Rock, DZRH, Home Radio and Magic 89.9: only when you tap Play on a radio card; the station sees your internet address. Love Radio, Easy Rock and DZRH stream from their own servers, Home Radio from radioca.st and Magic 89.9 from Triton (streamtheworld.com)')
    expect(text).toContain('PAGASA Panahon also loads when you tap Load the map on the Today map card')
    expect(text).toContain('ExchangeRate-API (open.er-api.com): the US dollar rate on Today, once a day')
    expect(text).not.toMatch(/Radio Paradise|Radio Swiss/)
    expect(text).toContain('Wikipedia: the "On this day" facts in Discover; it receives today\'s date only, never your name or place')
    expect(text).toContain('Ventusky gets the map centre rounded to about 1 km, the other two get no place from the app')
    expect(text).toContain('what you ask Jack goes through a relay on the family owner\'s own server first')
    expect(text).toContain('a photo you scan goes from a function on the family\'s own Supabase project straight to OpenRouter, with no relay') // photos skip the relay (records-extract)
    expect(text).toContain('Other official sites open in your browser only when you tap their link.')
    expect(text).not.toMatch(/Sentry|SMS/i)
    // D-131: the map lines match what LazyMap and the Rescue map do (OSM pictures with the flag off; with it on the choice is made once when the map opens, not per pan or zoom)
    expect(text).toContain('street map pictures on the Safety maps, the Rescue map and the Family map')
    expect(text).toContain('used when a Safety map opens outside Bohol and South Cotabato, opens zoomed out, or before the area map is on the phone; the choice is made when the map opens, so after panning away they stay as they started')
    expect(text).not.toContain('cannot be read')
    expect(text).toContain("the map files the Safety maps and the Rescue map read from the family's own project")
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
