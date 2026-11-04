import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layerState } from './hazardsLayers'
import type { HazardState } from './useHazards'

vi.mock('./store', () => ({ useKv: (_k: string, fb: unknown) => fb }))
let hz: HazardState = { status: 'off', levels: null, size: null, busy: false, download: () => {} }
vi.mock('./useHazards', () => ({ useHazards: () => hz }))
afterEach(() => { cleanup(); hz = { status: 'off', levels: null, size: null, busy: false, download: () => {} } })

const dampas = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone' } as never
const away = { weather: { lat: 14.5, lon: 121 }, zone: 'dampas', source: 'gps' } as never

describe('layerState with NOAH levels', () => {
  it('level 1-3 reads Low, Medium, High with the accuracy line; 0 says no mapped hazard, never a bare "little to none"', () => {
    const s = (n: 0 | 1 | 2 | 3) => layerState('flood', null, { flood: n, landslide: null, surge: null })
    expect(s(1)).toMatchObject({ reading: 'Low', tone: 'good' })
    expect(s(2)).toMatchObject({ reading: 'Medium', tone: 'warn' })
    expect(s(3)).toMatchObject({ reading: 'High', tone: 'warn' })
    expect(s(0).text).toBe("No mapped flood hazard here in NOAH's maps (100-year scenario). That is not a promise of safety: the maps may not cover every place, and a phone's position can be off by tens of metres.")
    expect(s(0).text).not.toMatch(/little to none/i)
  })
  it('null (no file, outside bounds) falls back to the old text', () => {
    expect(layerState('flood', null, { flood: null, landslide: null, surge: null }).text).toBe('Not checked for this place yet.')
  })
})

describe('HazardsPage with the hazard file', () => {
  it('flag off state changes nothing on the page', async () => {
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={dampas} />)
    expect(screen.queryByTestId('noah-credit')).toBeNull()
    expect(screen.queryByTestId('noah-missing')).toBeNull()
    expect(screen.getByTestId('layer-caption').textContent).toContain('No flood map for this place yet')
  })
  it('ready: the NOAH level shows in the caption and the credit line shows', async () => {
    hz = { ...hz, status: 'ready', levels: { flood: 1, landslide: 0, surge: 0 } }
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={dampas} />)
    expect(screen.getByTestId('layer-caption').textContent).toContain('Flood level from NOAH: Low')
    expect(screen.getByTestId('noah-credit').textContent).toContain('UP NOAH Center (Project NOAH), ODbL 1.0')
    fireEvent.click(screen.getByRole('button', { name: 'Landslide' }))
    expect(screen.getByTestId('layer-caption').textContent).toContain('No mapped landslide hazard here')
  })
  it('missing: says so and offers the download with its size', async () => {
    const download = vi.fn()
    hz = { ...hz, status: 'missing', size: 33_100_000, download }
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={dampas} />)
    expect(screen.getByTestId('noah-missing').textContent).toContain('Hazard map not on this phone yet')
    fireEvent.click(screen.getByRole('button', { name: 'Download hazard map (33 MB)' }))
    expect(download).toHaveBeenCalledOnce()
  })
  it('outside the home zones: honest "Not checked for this place yet", no invented level', async () => {
    hz = { ...hz, status: 'missing', size: null }
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={away} />)
    expect(screen.getByTestId('layer-caption').textContent).toBe('Not checked for this place yet.')
    expect(screen.getByTestId('noah-missing')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Download hazard map/ })).toBeNull()
  })
})
