import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ loc: { source: 'gps', lat: 29.7612, lon: -95.3698 } as { source: string; lat: number; lon: number } }))
vi.mock('../location/useLocation', async (orig) => ({ ...(await orig<typeof import('../location/useLocation')>()), resolveLocation: vi.fn(async () => h.loc) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false } }))

import HomePlaceRow from './HomePlaceRow'

beforeEach(async () => { await db.kv.clear(); h.loc = { source: 'gps', lat: 29.7612, lon: -95.3698 } })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const row = () => screen.findByRole('button', { name: /My home place/ })
const saved = async () => (await db.kv.get('loc.home'))?.value

describe('Settings > My home place', () => {
  it('shows Not set, then the saved name', async () => {
    render(<HomePlaceRow />)
    expect((await row()).textContent).toContain('Not set')
    await db.kv.put({ key: 'loc.home', value: { name: 'Houston, Texas', lat: 29.76, lon: -95.37, tz: 'America/Chicago' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /My home place/ }).textContent).toContain('Houston, Texas'))
  })
  it('search then pick saves name, position and zone on this phone and closes the sheet', async () => {
    render(<HomePlaceRow />)
    fireEvent.click(await row())
    const sheet = await screen.findByRole('dialog', { name: 'My home place' })
    fireEvent.change(within(sheet).getByLabelText('Search a city'), { target: { value: 'dallas' } })
    expect(within(sheet).getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual(['Dallas, Texas'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dallas, Texas' }))
    await waitFor(async () => expect(await saved()).toEqual({ name: 'Dallas, Texas', lat: 32.78, lon: -96.8, tz: 'America/Chicago' }))
  })
  it('a search that finds nothing says so and points to the phone\'s place', async () => {
    render(<HomePlaceRow />)
    fireEvent.click(await row())
    const sheet = await screen.findByRole('dialog')
    fireEvent.change(within(sheet).getByLabelText('Search a city'), { target: { value: 'zzzz' } })
    expect(within(sheet).getByRole('status').textContent).toMatch(/No city in the list/)
  })
  it('Use my phone\'s place names the nearest listed city, rounds the position to about 1 km, keeps the phone\'s zone', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/Chicago' } as Intl.ResolvedDateTimeFormatOptions)
    render(<HomePlaceRow />)
    fireEvent.click(await row())
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Use my phone's place now" }))
    await waitFor(async () => expect(await saved()).toEqual({ name: 'Houston, Texas', lat: 29.76, lon: -95.37, tz: 'America/Chicago' }))
  })
  it('no position from the phone: nothing is saved and the sheet says why', async () => {
    h.loc = { source: 'home', lat: 9.64, lon: 123.87 }
    render(<HomePlaceRow />)
    fireEvent.click(await row())
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(within(sheet).getByRole('button', { name: "Use my phone's place now" }))
    await waitFor(() => expect(within(sheet).getByRole('status').textContent).toMatch(/could not find your location/))
    expect(await saved()).toBeUndefined()
  })
  it('Remove clears it (only offered when one is saved)', async () => {
    render(<HomePlaceRow />)
    fireEvent.click(await row())
    expect(screen.queryByRole('button', { name: 'Remove my home place' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await db.kv.put({ key: 'loc.home', value: { name: 'Houston, Texas', lat: 29.76, lon: -95.37 } })
    await waitFor(() => expect(screen.getByRole('button', { name: /My home place/ }).textContent).toContain('Houston'))
    fireEvent.click(screen.getByRole('button', { name: /My home place/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove my home place' }))
    await waitFor(async () => expect(await saved()).toBeUndefined())
  })
})
