import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Loc } from '../location/geo'
import MapsPanel, { LOCATION_OFF, LOCATION_SLOW } from './MapsPanel'

const home: Loc = { lat: 9.65, lon: 123.88, source: 'home' }
const gps: Loc = { lat: 6.11, lon: 125.17, source: 'gps' }
let state: Loc = home
const ask = vi.fn()
vi.mock('../location/useLocation', () => ({ useLocation: () => ({ ...state, ask, setHome: vi.fn() }) }))

afterEach(() => { cleanup(); ask.mockReset(); state = home })

const near = () => screen.getByRole('button', { name: 'Near me' })

describe('MapsPanel abroad', () => {
  it('defaults to the zone, not the foreign phone position', () => {
    render(<MapsPanel loc={{ lat: 35.68, lon: 139.69 }} zone="conel" />)
    expect(near().getAttribute('aria-pressed')).toBe('false')
  })
})

describe('MapsPanel Near me', () => {
  it('is offered first without GPS and never asks on mount', () => {
    render(<MapsPanel />)
    expect(screen.getByRole('group', { name: 'Map place' }).firstElementChild).toBe(near())
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks once on tap, shows Finding you, then selects here when granted', async () => {
    let done!: (l: Loc) => void
    ask.mockReturnValue(new Promise<Loc>((r) => { done = r }))
    render(<MapsPanel />)
    fireEvent.click(near())
    expect(ask).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Finding you…')
    done(gps)
    await waitFor(() => expect(near().getAttribute('aria-pressed')).toBe('true'))
    expect(screen.queryByText('Finding you…')).toBeNull()
  })

  it('keeps the previous place and explains when denied', async () => {
    ask.mockResolvedValue(home)
    render(<MapsPanel />)
    const first = screen.getByRole('group', { name: 'Map place' }).children[1]
    expect(first.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(near())
    await screen.findByText(LOCATION_OFF)
    expect(near().getAttribute('aria-pressed')).toBe('false')
    expect(first.getAttribute('aria-pressed')).toBe('true')
  })

  it('says it could not find you (not "off") when permission is granted but GPS failed', async () => {
    ask.mockResolvedValue(home)
    vi.stubGlobal('navigator', { ...navigator, permissions: { query: () => Promise.resolve({ state: 'granted' }) } })
    render(<MapsPanel />)
    fireEvent.click(near())
    await screen.findByText(LOCATION_SLOW)
    expect(screen.queryByText(LOCATION_OFF)).toBeNull()
    vi.unstubAllGlobals()
  })

  it('does not ask when GPS is already granted', () => {
    state = gps
    render(<MapsPanel />)
    expect(near().getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(near())
    expect(ask).not.toHaveBeenCalled()
  })
})
