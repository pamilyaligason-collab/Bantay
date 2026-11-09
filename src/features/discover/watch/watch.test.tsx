import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import benefits from '../../../data/discover/benefits.json'
import { playable } from '../../health/library/videosLogic'
import { DISCOVER_VIDEOS } from '../learn/ready'
import Watch, { WATCH_PICK } from './Screen'

const ev = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../../admin/events', async (orig) => ({ ...(await orig<typeof import('../../admin/events')>()), track: async (_k: string, n: string) => { ev.calls.push(n); return true } }))
beforeEach(() => { ev.calls.length = 0 })
afterEach(cleanup)

describe('Watch', () => {
  it('shows 4 video cards at a time in one column (no player, no side-swipe row) and one row per topic plus Live TV; health topics are gone', () => {
    const { container } = render(<Watch />)
    expect(DISCOVER_VIDEOS.filter(playable).length).toBe(55) // counted by hand in src/data/discover/ready.json: Be prepared 20, Farming and DIY 23, Listen 7, Recipe videos 5, none a placeholder
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(4)
    expect(screen.getByRole('button', { name: 'Show 4 more' })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('.carousel, .dc-posters')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Checked videos' }).nextElementSibling!.textContent).toBe('55')
    const imgs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src')!)
    expect(imgs.length).toBe(4)
    expect(imgs.every((u) => u.startsWith('https://i.ytimg.com/vi/'))).toBe(true)
    expect(['Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'].map((t) => screen.getByTestId('playlist-' + t).textContent)).toEqual(['Be prepared20 videos', 'Farming and DIY23 videos', 'Listen7 videos', 'Recipe videos5 videos'])
    for (const t of ['Move', 'Safety', 'Mind', 'Diabetes', 'Food']) expect(screen.queryByTestId('playlist-' + t)).toBeNull()
    expect(screen.getByTestId('live-tv').textContent).toContain('Coming soon')
    expect(screen.getByText(/or opens in YouTube/)).toBeTruthy()
    expect(screen.getByTestId('watch-health-link').getAttribute('href')).toBe('#health')
  })
  it('Show more adds four cards at a time', () => {
    render(<Watch />)
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(8)
  })
  it('a poster picks the video; the player loads nothing until its own tap, and keeps an Open in YouTube link', () => {
    const { container } = render(<Watch />)
    fireEvent.click(screen.getByRole('button', { name: /^Video, Disaster Wais: the go bag/ }))
    const p = screen.getByTestId('watch-player')
    expect(container.querySelector('iframe')).toBeNull()
    expect(within(p).getByRole('button', { name: 'Play Disaster Wais: the go bag' })).toBeTruthy()
    expect(within(p).getByRole('link', { name: /Open in YouTube/ }).getAttribute('href')).toBe('https://www.youtube.com/watch?v=oTyYzHntBxQ')
    fireEvent.click(within(p).getByRole('button', { name: 'Play Disaster Wais: the go bag' }))
    expect(container.querySelector('iframe')!.getAttribute('src')).toContain('youtube-nocookie.com/embed/oTyYzHntBxQ')
  })
  it('a card pick and the play tap on the player each count once for the channel (known channels only)', () => {
    const { container } = render(<Watch />)
    const v = DISCOVER_VIDEOS.filter(playable).find((x) => x.title.startsWith('Disaster Wais: the go bag'))!
    fireEvent.click(screen.getByRole('button', { name: /^Video, Disaster Wais: the go bag/ }))
    expect(ev.calls).toEqual(['watch_ch_' + v.source.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31).replace(/_+$/, '')])
    fireEvent.click(within(screen.getByTestId('watch-player')).getByRole('button', { name: 'Play Disaster Wais: the go bag' }))
    expect(ev.calls).toHaveLength(2)
    expect(ev.calls[1]).toBe(ev.calls[0])
    expect(container.querySelector('iframe')).not.toBeNull()
  })
  it('a topic row narrows the grid and a second tap shows all again', () => {
    render(<Watch />)
    fireEvent.click(within(screen.getByTestId('playlist-Listen')).getByRole('button'))
    expect(screen.getByRole('heading', { name: 'Listen' }).nextElementSibling!.textContent).toBe('7')
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }))
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(7)
    fireEvent.click(within(screen.getByTestId('playlist-Listen')).getByRole('button'))
    expect(screen.getByRole('heading', { name: 'Checked videos' }).nextElementSibling!.textContent).toBe('55')
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(4)
  })
  it('a picture that cannot load falls back to the title on a drawn tile', () => {
    const { container } = render(<Watch />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelectorAll('img').length).toBe(3) // the card keeps its same-size placeholder, title and name
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(4)
  })
})

describe('Watch opened from the overview', () => {
  it('opens the stored video on mount (player, no iframe) and clears the key', () => {
    const v = DISCOVER_VIDEOS.filter(playable)[3]!
    sessionStorage.setItem(WATCH_PICK, v.id)
    const { container } = render(<Watch />)
    expect(within(screen.getByTestId('watch-player')).getByRole('button', { name: 'Play ' + v.title })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull()
    expect(sessionStorage.getItem(WATCH_PICK)).toBeNull()
  })
  it('focus moves to the player when it opens from the overview', async () => {
    const v = DISCOVER_VIDEOS.filter(playable)[3]!
    sessionStorage.setItem(WATCH_PICK, v.id)
    render(<Watch />)
    const play = within(screen.getByTestId('watch-player')).getByRole('button', { name: 'Play ' + v.title })
    await waitFor(() => expect(document.activeElement).toBe(play))
  })
  it('shows no player without the key or with an unknown id', () => {
    render(<Watch />)
    expect(screen.queryByTestId('watch-player')).toBeNull()
    cleanup()
    sessionStorage.setItem(WATCH_PICK, 'zzzzzzzzzzz')
    render(<Watch />)
    expect(screen.queryByTestId('watch-player')).toBeNull()
  })
})

describe('benefits data', () => {
  it('only the two named benefits, each with an https source and a checked date', () => {
    expect(benefits.benefits.map((b) => b.id)).toEqual(['konsulta', 'senior'])
    for (const b of benefits.benefits) { expect(b.url).toMatch(/^https:\/\//); expect(b.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/) }
  })
})
