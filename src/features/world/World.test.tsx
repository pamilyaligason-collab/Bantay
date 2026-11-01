import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { ALERT_KEY } from './prefs'

const flags = vi.hoisted(() => ({ worldFeeds: false, phivolcs: false }))
vi.mock('../safety/flags', () => ({ FLAGS: flags }))
vi.mock('../location/useLocation', () => ({
  useLocation: () => ({}),
  usePlaceFrom: () => ({ weather: { lat: 9.6457, lon: 123.878 }, zone: 'dampas', source: 'zone' })
}))
vi.mock('../location/ZonePicker', () => ({ default: () => <span>chip</span> }))
import World from './World'

const quake: Alert = { id: 'q1', kind: 'quake', level: 'M5.1', title: 'M5.1 quake near Bohol', what: '', where: '', when: '', doNow: '', source: 'USGS', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 9.7, lon: 123.9, bulletin: '' }

beforeEach(async () => { await db.kv.clear(); flags.worldFeeds = false; flags.phivolcs = false })
afterEach(cleanup)

describe('World', () => {
  it('with no alerts the three lists show their empty lines', () => {
    render(<World />)
    expect(screen.getByText('No active hazards at Dampas or Conel')).toBeTruthy()
    expect(screen.getByText('No official warnings right now')).toBeTruthy()
    expect(screen.getByText('No big events listed by GDACS')).toBeTruthy()
  })
  it('hides the feed sections and the volcano row while their flags are off', () => {
    render(<World />)
    for (const t of ['Forecasts to watch', 'Macro and news', 'Your panels']) expect(screen.queryByRole('heading', { name: t })).toBeNull()
    expect(screen.queryByText('Volcano alert levels')).toBeNull()
  })
  it('shows the feed sections as empty states when the flag is on', () => {
    flags.worldFeeds = true; flags.phivolcs = true
    render(<World />)
    expect(screen.getByRole('heading', { name: 'Forecasts to watch' })).toBeTruthy()
    expect(screen.getByText('Volcano alert levels')).toBeTruthy()
  })
  it('lists a real alert and the filter hides the other lists', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    render(<World />)
    expect((await screen.findAllByText('M5.1 quake near Bohol')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'World' }))
    expect(screen.queryByText('M5.1 quake near Bohol')).toBeNull()
    expect(screen.getByText('No big events listed by GDACS')).toBeTruthy()
  })
  it('the digest card shows the saved time and links to the settings', async () => {
    await db.kv.put({ key: ALERT_KEY, value: { digestTime: '06:30' } })
    render(<World />)
    await waitFor(() => expect(screen.getByText('Daily digest (coming) · 06:30')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#safety/alerts')
  })
})
