import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ on: false, photos: [] as { id: string; path: string; caption: string | null; takenOn: string | null; createdAt: string; mine: boolean; url: string | null }[] }))
vi.mock('../shell/useKv', () => ({ useKv: () => [h.on, vi.fn(), true] }))
vi.mock('./memoriesApi', () => ({ listPhotos: async () => ({ ok: true, data: h.photos }), addPhoto: vi.fn(), removePhoto: vi.fn() }))
const { default: Memories } = await import('./Memories')

afterEach(() => { cleanup(); h.on = false; h.photos = [] })
const photo = (n: number) => ({ id: `p${n}`, path: `f/${n}.jpg`, caption: `Photo ${n}`, takenOn: null, createdAt: '2026-10-01T02:00:00+00:00', mine: false, url: null })

describe('Memories (F8)', () => {
  it('off: one honest empty state, no second title, no "Off for now"', () => {
    const { container } = render(<Memories />)
    expect(container.querySelectorAll('h1,h2').length).toBe(0) // the page title is the one h1, in Family.tsx
    expect(screen.getByText('Memories is off')).toBeTruthy()
    expect(screen.queryByText(/Off for now/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Turn on Memories' })).toBeTruthy()
  })
})

describe('Memories grid (S25)', () => {
  const grid = () => within(screen.getByTestId('mem-grid')).getByRole('group', { name: 'Family photos' })
  const tiles = () => [...grid().querySelectorAll('.mem-tile')].map((t) => t.textContent ?? '')

  it('the Add a photo tile is the first cell of a 2-column grid; three photos fit with no Show more', async () => {
    h.on = true; h.photos = [photo(1), photo(2), photo(3)]
    render(<Memories />)
    await waitFor(() => expect(tiles()).toHaveLength(4))
    expect(grid().className).toBe('more-grid')
    expect(tiles()[0]).toContain('Add a photo')
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
  })

  it('six photos: Add plus three show, Show 3 more adds the rest, Show less folds back', async () => {
    h.on = true; h.photos = [1, 2, 3, 4, 5, 6].map(photo)
    render(<Memories />)
    await waitFor(() => expect(tiles()).toHaveLength(4))
    expect(tiles()[0]).toContain('Add a photo')
    expect(tiles()[3]).toContain('Photo 3')
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }))
    expect(tiles()).toHaveLength(7) // Add and six photos
    expect(tiles()[6]).toContain('Photo 6')
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(tiles()).toHaveLength(4)
  })
})
