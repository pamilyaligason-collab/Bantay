import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HazardState } from './useHazards'

const F = vi.hoisted(() => ({ localPacks: true, offlineMaps: false }))
vi.mock('./flags', () => ({ FLAGS: F }))
vi.mock('./store', () => ({ useKv: (_k: string, fb: unknown) => fb }))
const S = vi.hoisted(() => ({ blob: null as Blob | null, url: null as string | null, overlay: vi.fn(() => ({ addTo: vi.fn() })), setup: null as null | ((L: never, m: never) => void) }))
let hz: HazardState = { status: 'ready', online: true, levels: { flood: 2, landslide: null, surge: null }, size: null, busy: false, download: () => {} }
vi.mock('./useHazards', () => ({ useHazards: () => hz }))
vi.mock('./usePacks', async (orig) => ({ ...(await orig<typeof import('./usePacks')>()), useUnit: () => '1380600000' }))
vi.mock('./LazyMap', () => ({ default: (p: { depKey: string; setup: (L: never, m: never) => void }) => { S.setup = p.setup; return <div data-testid="hazards-map" data-dep={p.depKey} /> } }))
vi.mock('../world/KindMark', () => ({ kindMarker: () => ({ addTo: vi.fn() }) }))
vi.mock('./hazardsLayers', async (orig) => ({ ...(await orig<typeof import('./hazardsLayers')>()), useHazardBlob: () => S.blob, useHazardUrl: () => S.url, hazardOverlay: S.overlay }))
afterEach(() => { cleanup(); S.blob = null; S.url = null; S.overlay.mockClear(); S.setup = null })

const away = { weather: { lat: 14.5, lon: 121 }, zone: 'dampas', source: 'gps' } as never

describe('HazardsPage overlay source away from the home zones', () => {
  it('with both a stored file and a public URL the map paints the stored Blob', async () => {
    S.blob = new Blob(['stored!'])
    S.url = 'https://h.test/hz.pmtiles'
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={away} />)
    expect(screen.getByTestId('hz-legend').textContent).toContain('Flood level')
    S.setup!({} as never, {} as never)
    expect(S.overlay).toHaveBeenCalledWith({}, S.blob, 'flood')
  })
  it('with only the public URL the map paints from the URL', async () => {
    S.url = 'https://h.test/hz.pmtiles'
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={away} />)
    S.setup!({} as never, {} as never)
    expect(S.overlay).toHaveBeenCalledWith({}, 'https://h.test/hz.pmtiles', 'flood')
  })
  it('with neither there is no overlay and no legend', async () => {
    const { default: Page } = await import('./HazardsPage')
    render(<Page place={away} />)
    S.setup!({} as never, {} as never)
    expect(S.overlay).not.toHaveBeenCalled()
    expect(screen.queryByTestId('hz-legend')).toBeNull()
  })
})
