import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import benefits from '../../../data/discover/benefits.json'
import { playable } from '../../health/library/videosLogic'
import { DISCOVER_VIDEOS } from '../learn/ready'
import Watch, { WATCH_PICK } from './Screen'

afterEach(cleanup)

describe('Watch', () => {
  it('draws every playable video as a poster (no player) and one row per topic plus Live TV', () => {
    const { container } = render(<Watch />)
    expect(DISCOVER_VIDEOS.filter(playable).length).toBe(62) // counted by hand: 27 in src/data/videos.json (19 plus 8 added in S24) plus 35 in src/data/discover/ready.json (14 plus 21 added in S24), none a placeholder
    expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBe(62)
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Checked videos' }).nextElementSibling!.textContent).toBe('62')
    const imgs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src')!)
    expect(imgs.length).toBe(62)
    expect(imgs.every((u) => u.startsWith('https://i.ytimg.com/vi/'))).toBe(true)
    // topics counted by hand: Move 5, Safety 12, Mind 3, Diabetes 4, Food 3, Be prepared 17, Farming and DIY 9, Listen 4, Recipe videos 5
    expect(['Move', 'Safety', 'Mind', 'Diabetes', 'Food', 'Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'].map((t) => screen.getByTestId('playlist-' + t).textContent)).toEqual(['Move5 videos', 'Safety12 videos', 'Mind3 videos', 'Diabetes4 videos', 'Food3 videos', 'Be prepared17 videos', 'Farming and DIY9 videos', 'Listen4 videos', 'Recipe videos5 videos'])
    expect(screen.getByTestId('live-tv').textContent).toContain('Coming soon')
    expect(screen.getByText(/or opens in YouTube/)).toBeTruthy()
  })
  it('a poster picks the video; the player loads nothing until its own tap, and keeps an Open in YouTube link', () => {
    const { container } = render(<Watch />)
    fireEvent.click(screen.getByRole('button', { name: /^Choose Hands-only CPR/ }))
    const p = screen.getByTestId('watch-player')
    expect(container.querySelector('iframe')).toBeNull()
    expect(within(p).getByRole('button', { name: 'Play Hands-only CPR, 1 min' })).toBeTruthy()
    expect(within(p).getByRole('link', { name: /Open in YouTube/ }).getAttribute('href')).toBe('https://www.youtube.com/watch?v=M4ACYp75mjU')
    fireEvent.click(within(p).getByRole('button', { name: 'Play Hands-only CPR, 1 min' }))
    expect(container.querySelector('iframe')!.getAttribute('src')).toContain('youtube-nocookie.com/embed/M4ACYp75mjU')
  })
  it('a topic row narrows the poster row and a second tap shows all again', () => {
    render(<Watch />)
    fireEvent.click(within(screen.getByTestId('playlist-Safety')).getByRole('button'))
    expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBe(12)
    expect(screen.getByRole('heading', { name: 'Safety' })).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('playlist-Safety')).getByRole('button'))
    expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBe(62)
  })
  it('a picture that cannot load falls back to the title on a drawn tile', () => {
    const { container } = render(<Watch />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('.dc-poster[data-thumb="off"]')).toBeTruthy()
    expect(container.querySelectorAll('img').length).toBe(61)
  })
})

describe('Watch opened from the overview', () => {
  it('opens the stored video on mount (player, no iframe) and clears the key', () => {
    const v = DISCOVER_VIDEOS.filter(playable)[3]!
    sessionStorage.setItem(WATCH_PICK, v.id)
    const { container } = render(<Watch />)
    expect(within(screen.getByTestId('watch-player')).getByRole('button', { name: 'Play ' + v.title + ', ' + v.minutes + ' min' })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull()
    expect(sessionStorage.getItem(WATCH_PICK)).toBeNull()
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
