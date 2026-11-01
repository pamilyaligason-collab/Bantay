import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { playable, VIDEOS } from '../health/library/videosLogic'
import { featured } from './today/featured'
import Overview from './Overview'

beforeEach(() => { location.hash = '#discover'; sessionStorage.clear() })
afterEach(cleanup)

const now = new Date(2026, 9, 28, 10, 20)
const vids = VIDEOS.filter(playable)
const { hero, more } = featured(now, vids)

describe('Overview head, hero, video cards, season', () => {
  it('draws the large title with the kicker', () => {
    render(<Overview now={now} />)
    const head = screen.getByTestId('dc-head')
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(head.querySelector('.lt-kicker')!.textContent).toBe('Learn, watch, play')
  })
  it('one hero holding the video of the day', () => {
    const { container } = render(<Overview now={now} />)
    expect(container.querySelectorAll('[data-hero]').length).toBe(1)
    const h = within(screen.getByTestId('dc-hero'))
    expect(screen.getByTestId('dc-hero').hasAttribute('data-hero')).toBe(true)
    expect(h.getByText(`Watch · ${vids.length} checked videos`)).toBeTruthy()
    expect(h.getByText(hero!.title)).toBeTruthy()
    expect(h.getByText('Plays in privacy mode after you tap')).toBeTruthy()
    const a = screen.getByTestId('dc-hero').querySelector('a')!
    expect(a.getAttribute('href')).toBe('#discover/watch')
    expect(a.querySelector('.pt-a')!.textContent).toBe('Watch')
  })
  it('two more video cards, thumbs are still pictures with no referrer', () => {
    const { container } = render(<Overview now={now} />)
    const cards = screen.getByTestId('dc-videos').querySelectorAll('a.pt')
    expect(Array.from(cards).map((c) => c.querySelector('.pt-v')!.textContent)).toEqual(more.map((m) => m.title))
    expect(Array.from(cards).map((c) => c.getAttribute('href'))).toEqual(['#discover/watch', '#discover/watch'])
    const imgs = Array.from(container.querySelectorAll('.dc-thumb img'))
    expect(imgs.length).toBe(3)
    const ids = [hero!, ...more].map((v) => v.id)
    imgs.forEach((img, i) => {
      expect(img.getAttribute('src')).toBe(`https://i.ytimg.com/vi/${ids[i]}/mqdefault.jpg`)
      expect(img.getAttribute('alt')).toBe('')
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
      expect(img.getAttribute('loading')).toBe('lazy')
    })
  })
  it('the season row follows the video cards; no tiles, no pick', () => {
    render(<Overview now={now} />)
    const v = screen.getByTestId('dc-videos'), s = screen.getByTestId('season-row')
    expect(v.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId('discover-tiles')).toBeNull()
    expect(screen.queryByTestId('pick')).toBeNull()
  })
  it('tapping the hero or a small card stores that video for Watch', () => {
    const { container } = render(<Overview now={now} />)
    fireEvent.click(screen.getByTestId('dc-hero').querySelector('a')!)
    expect(sessionStorage.getItem('dc.watch')).toBe(hero!.id)
    fireEvent.click(screen.getByTestId('dc-videos').querySelectorAll('a.pt')[1]!)
    expect(sessionStorage.getItem('dc.watch')).toBe(more[1]!.id)
    expect(container.querySelectorAll('a[href="#discover/watch"]').length).toBe(3)
  })
})
