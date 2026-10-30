import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import benefits from '../../../data/discover/benefits.json'
import { playable, VIDEOS } from '../../health/library/videosLogic'
import Watch from './Screen'

afterEach(cleanup)

describe('Watch', () => {
  it('draws every playable video as a poster (no player) and one row per topic plus Live TV', () => {
    const { container } = render(<Watch />)
    expect(VIDEOS.filter(playable).length).toBe(12) // counted by hand in src/data/videos.json: 12 entries, none a placeholder
    expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBe(12)
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Checked videos' }).nextElementSibling!.textContent).toBe('12')
    const imgs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src')!)
    expect(imgs.length).toBe(12)
    expect(imgs.every((u) => u.startsWith('https://i.ytimg.com/vi/'))).toBe(true)
    // topics counted by hand: Move 5, Safety 3, Mind 2, Diabetes 1, Food 1
    expect(['Move', 'Safety', 'Mind', 'Diabetes', 'Food'].map((t) => screen.getByTestId('playlist-' + t).textContent)).toEqual(['Move5 videos', 'Safety3 videos', 'Mind2 videos', 'Diabetes1 video', 'Food1 video'])
    expect(screen.getByTestId('live-tv').textContent).toContain('Coming soon')
    expect(screen.getByText(/or opens in YouTube/)).toBeTruthy()
  })
  it('a poster picks the video; the player loads nothing until its own tap, and keeps an Open in YouTube link', () => {
    const { container } = render(<Watch />)
    fireEvent.click(screen.getByRole('button', { name: /^Choose Hands-only CPR/ }))
    const p = screen.getByTestId('watch-player')
    expect(container.querySelector('iframe')).toBeNull()
    expect(within(p).getByRole('button', { name: 'Play Hands-only CPR' })).toBeTruthy()
    expect(within(p).getByRole('link', { name: /Open in YouTube/ }).getAttribute('href')).toBe('https://www.youtube.com/watch?v=M4ACYp75mjU')
    fireEvent.click(within(p).getByRole('button', { name: 'Play Hands-only CPR' }))
    expect(container.querySelector('iframe')!.getAttribute('src')).toContain('youtube-nocookie.com/embed/M4ACYp75mjU')
  })
  it('a topic row narrows the poster row and a second tap shows all again', () => {
    render(<Watch />)
    fireEvent.click(within(screen.getByTestId('playlist-Safety')).getByRole('button'))
    expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBe(3)
    expect(screen.getByRole('heading', { name: 'Safety' })).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('playlist-Safety')).getByRole('button'))
    expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBe(12)
  })
  it('a picture that cannot load falls back to the title on a drawn tile', () => {
    const { container } = render(<Watch />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('.dc-poster[data-thumb="off"]')).toBeTruthy()
    expect(container.querySelectorAll('img').length).toBe(11)
  })
})

describe('benefits data', () => {
  it('only the two named benefits, each with an https source and a checked date', () => {
    expect(benefits.benefits.map((b) => b.id)).toEqual(['konsulta', 'senior'])
    for (const b of benefits.benefits) { expect(b.url).toMatch(/^https:\/\//); expect(b.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/) }
  })
})
