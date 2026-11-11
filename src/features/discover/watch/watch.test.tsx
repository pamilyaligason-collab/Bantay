import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import benefits from '../../../data/discover/benefits.json'
import { playable } from '../../health/library/videosLogic'
import { DISCOVER_VIDEOS } from '../learn/ready'
import { watchName } from '../channels'
import Watch, { videosOf, WATCH_PICK } from './Screen'

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
    expect(screen.getByRole('heading', { name: 'Watch · All videos' }).nextElementSibling!.textContent).toBe('55')
    const imgs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src')!)
    expect(imgs.length).toBe(4)
    expect(imgs.every((u) => u.startsWith('https://i.ytimg.com/vi/'))).toBe(true)
    expect(['All', 'Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'].map((t) => screen.getByTestId('playlist-' + t).textContent)).toEqual(['All', 'Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'])
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
    expect(watchName(v.source)).not.toBeNull() // a known channel, so the tap is counted
    expect(ev.calls).toEqual([watchName(v.source)])
    fireEvent.click(within(screen.getByTestId('watch-player')).getByRole('button', { name: 'Play Disaster Wais: the go bag' }))
    expect(ev.calls).toHaveLength(2)
    expect(ev.calls[1]).toBe(ev.calls[0])
    expect(container.querySelector('iframe')).not.toBeNull()
  })
  it('a topic chip narrows the grid and the All chip shows every video again', () => {
    render(<Watch />)
    fireEvent.click(screen.getByTestId('playlist-Listen'))
    expect(screen.getByRole('heading', { name: 'Watch · Listen' }).nextElementSibling!.textContent).toBe('7')
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }))
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(7)
    fireEvent.click(screen.getByTestId('playlist-All'))
    expect(screen.getByRole('heading', { name: 'Watch · All videos' }).nextElementSibling!.textContent).toBe('55')
    expect(screen.getAllByRole('button', { name: /^Video, / }).length).toBe(4)
  })
  it('S30 L6: the chips sit directly above the videos they swap, the picked one is selected, the heading and the live note follow, keys move between them', () => {
    render(<Watch />)
    const tabs = screen.getByRole('tablist', { name: 'Video topics' })
    const panel = screen.getByRole('tabpanel')
    expect(tabs.nextElementSibling).toBe(panel)
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
    const first = () => screen.getAllByRole('button', { name: /^Video, / })[0]!.getAttribute('aria-label')
    const prep = screen.getByRole('tab', { name: 'Be prepared' })
    expect(prep.getAttribute('aria-controls')).toBe(panel.id)
    fireEvent.click(prep)
    expect(prep.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('heading', { name: 'Watch · Be prepared' })).toBeTruthy()
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(prep.id)
    expect(screen.getByTestId('watch-live').textContent).toBe('Showing 20 Be prepared videos')
    expect(screen.getByTestId('watch-live').getAttribute('aria-live')).toBe('polite')
    const prepFirst = first()
    fireEvent.keyDown(prep, { key: 'ArrowRight' })
    const farm = screen.getByRole('tab', { name: 'Farming and DIY' })
    expect(farm.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(farm)
    expect(screen.getByRole('heading', { name: 'Watch · Farming and DIY' })).toBeTruthy()
    expect(first()).not.toBe(prepFirst) // a different video row below the chip
    fireEvent.keyDown(farm, { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
  })
  it('the live note and the list name say one noun for every topic label, never "videos videos"', () => {
    render(<Watch />)
    const topics = [...new Set(DISCOVER_VIDEOS.filter(playable).map((v) => v.topic))]
    expect(topics).toEqual(['Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'])
    const want: Record<string, string> = { 'Be prepared': 'Showing 20 Be prepared videos', 'Farming and DIY': 'Showing 23 Farming and DIY videos', Listen: 'Showing 7 Listen videos', 'Recipe videos': 'Showing 5 Recipe videos' }
    expect(screen.getByTestId('watch-live').textContent).toBe('Showing 55 checked videos')
    for (const t of topics) {
      fireEvent.click(screen.getByRole('tab', { name: t }))
      expect(screen.getByTestId('watch-live').textContent).toBe(want[t])
      expect(screen.getByTestId('watch-live').textContent).not.toMatch(/videos videos/i)
      expect(screen.getByTestId('watch-grid').getAttribute('aria-label') ?? '').not.toMatch(/videos videos/i)
    }
    expect(videosOf('Recipe videos')).toBe('Recipe videos')
  })
  it('a new topic scrolls the list panel to its start; the first paint and a repeat tap on the same chip do not', () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    render(<Watch />)
    expect(spy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Listen' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.instances[0]).toBe(screen.getByRole('tabpanel'))
    expect(spy).toHaveBeenLastCalledWith({ block: 'nearest' })
    fireEvent.click(screen.getByRole('tab', { name: 'Listen' }))
    expect(spy).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(spy).toHaveBeenCalledTimes(2)
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
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
