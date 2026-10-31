import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isDiscoverSubRoot, registerSub, subOf } from '../features/discover'
import { PickCard, SeasonRow } from '../features/discover/today/Cards'
import { pickOfDay } from '../features/discover/today/pick'
import { dayKey } from '../features/discover/play/score'
import { JACK_ALT } from '../features/look'
import Discover from './Discover'

beforeEach(() => { location.hash = '#discover' })
afterEach(cleanup)

const day = (m: number, d: number) => new Date(2026, m - 1, d, 10, 20)

describe('Discover overview (#discover)', () => {
  it('draws the h1, the pick hero and five tiles in order Learn, Watch, Listen, Play, News, each a link to its sub; no pill row', () => {
    render(<Discover />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(screen.getByTestId('pick')).toBeTruthy()
    const tiles = within(screen.getByTestId('discover-tiles')).getAllByRole('link')
    expect(tiles.map((a) => a.getAttribute('href'))).toEqual(['#discover/learn', '#discover/watch', '#discover/listen', '#discover/play', '#discover/news'])
    expect(tiles.map((a) => a.querySelector('.tl-label')!.textContent)).toEqual(['Learn', 'Watch', 'Listen', 'Play', 'News'])
    expect(screen.queryByRole('group', { name: 'Discover sections' })).toBeNull()
    expect(tiles.map((a) => a.getAttribute('data-hue'))).toEqual(['amber', 'terra', 'green', 'lilac', 'blue']) // no two neighbours share a hue
    expect(screen.getByTestId('tile-watch').textContent).toContain('12 checked videos') // 12 playable entries, counted by hand in src/data/videos.json
  })
  it('the pick hero carries Jack by pick type: recipe cooking, video watching, trivia and fact reading; the whole card is one link', () => {
    const seen = new Map<string, string>()
    for (let d = 1; d <= 28 && seen.size < 3; d++) {
      const kind = pickOfDay(dayKey(day(11, d))).kind
      const k = kind === 'fact' ? 'trivia' : kind
      if (seen.has(k)) continue
      const { container } = render(<PickCard now={day(11, d)} />)
      seen.set(k, container.querySelector('img.jack')!.getAttribute('alt')!)
      expect(container.querySelectorAll('a').length).toBe(1)
      cleanup()
    }
    expect(seen.get('recipe')).toBe(JACK_ALT.cooking)
    expect(seen.get('video')).toBe(JACK_ALT.watching)
    expect(seen.get('trivia')).toBe(JACK_ALT.reading)
  })
  it('a video pick leaves the app in a new tab; a recipe stays inside', () => {
    let video: Date | undefined, recipe: Date | undefined
    for (let d = 1; d <= 28; d++) { const k = pickOfDay(dayKey(day(11, d))).kind; if (k === 'video') video ??= day(11, d); if (k === 'recipe') recipe ??= day(11, d) }
    render(<PickCard now={video!} />)
    expect(screen.getByRole('link').getAttribute('target')).toBe('_blank')
    cleanup()
    render(<PickCard now={recipe!} />)
    expect(screen.getByRole('link').getAttribute('href')).toMatch(/^#discover\/learn\/recipe\//)
  })
  it('the season is one row that opens #discover/season; rain streaks in the rainy season, a candle glow at Undas, nothing outside a season', () => {
    const { container } = render(<SeasonRow now={day(7, 20)} />) // rainy and typhoon season
    expect(screen.getByTestId('season-row').getAttribute('data-hue')).toBe('blue')
    expect(container.querySelectorAll('.wxs-rain i').length).toBe(6)
    expect(screen.getByRole('link').getAttribute('href')).toBe('#discover/season')
    cleanup()
    const undas = render(<SeasonRow now={day(10, 28)} />)
    expect(undas.container.querySelector('.dc-sea-bg')!.getAttribute('data-s')).toBe('undas')
    expect(undas.container.querySelectorAll('.wxs-rain').length).toBe(0)
    cleanup()
    const none = render(<SeasonRow now={day(2, 10)} />)
    expect(none.container.innerHTML).toBe('')
  })
  it('#discover/season has a way back to the overview', () => {
    location.hash = '#discover/season'
    render(<Discover />)
    expect(screen.getByRole('link', { name: 'Back to Discover' }).getAttribute('href')).toBe('#discover')
  })
})

describe('Discover sub pages', () => {
  it('has the five sub-tabs in order Learn, Watch, Listen, Play, News and the page title is the sub', () => {
    location.hash = '#discover/learn'
    render(<Discover />)
    const tabs = screen.getByRole('group', { name: 'Discover sections' }).querySelectorAll('button')
    expect(Array.from(tabs).map((b) => b.textContent)).toEqual(['Learn', 'Watch', 'Listen', 'Play', 'News'])
    expect(screen.getByRole('button', { name: 'Learn' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Learn')
    expect(screen.getByRole('link', { name: 'Back to Discover' }).getAttribute('href')).toBe('#discover')
    expect(screen.queryByTestId('pick')).toBeNull()
  })
  it('Watch and Listen are registered now, so they draw their own screens', () => {
    location.hash = '#discover/watch'
    render(<Discover />)
    expect(screen.queryByText('Coming in this update')).toBeNull()
    expect(screen.getByTestId('watch')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Watch' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('one pill slides by --i; no pick on a sub page; Learn deeper pages draw their own header', () => {
    location.hash = '#discover/play'
    const { container } = render(<Discover />)
    const nav = screen.getByRole('group', { name: 'Discover sections' })
    expect(nav.style.getPropertyValue('--i')).toBe('3')
    expect(container.querySelectorAll('.dc-pill').length).toBe(1)
    expect(screen.queryByTestId('pick')).toBeNull()
    cleanup()
    location.hash = '#discover/learn/recipes'
    render(<Discover />)
    expect(screen.queryByTestId('pick')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Discover sections' })).toBeNull()
  })
  it('tapping a sub-tab writes #discover/<sub>', () => {
    location.hash = '#discover/learn'
    render(<Discover />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(location.hash).toBe('#discover/play')
  })
  it('registerSub draws that screen in place of the card, and only for its own sub', () => {
    registerSub('news', () => <p>News lane screen</p>)
    location.hash = '#discover/news'
    render(<Discover />)
    expect(screen.getByText('News lane screen')).toBeTruthy()
    expect(screen.queryByText('Coming in this update')).toBeNull()
    cleanup()
    location.hash = '#discover/watch'
    render(<Discover />)
    expect(screen.queryByText('News lane screen')).toBeNull()
    expect(screen.getByTestId('watch')).toBeTruthy()
  })
  it('#discover/learn/library draws the Health library, with its Back going to Learn', () => {
    location.hash = '#discover/learn/library'
    render(<Discover />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Health library')
    expect(screen.getByRole('link', { name: 'Back to Learn' }).getAttribute('href')).toBe('#discover/learn')
  })
  it('a library article goes back to the library list', () => {
    location.hash = '#discover/learn/library/c%3Adiabetes'
    render(<Discover />)
    expect(screen.getByRole('link', { name: 'Back to the library' }).getAttribute('href')).toBe('#discover/learn/library')
  })
})

describe('discover hash helpers', () => {
  it('subOf reads the sub, deeper routes too, and falls back to learn', () => {
    expect(subOf('#discover')).toBe('learn')
    expect(subOf('#discover/listen')).toBe('listen')
    expect(subOf('#discover/play/memory')).toBe('play')
    expect(subOf('#discover/nope')).toBe('learn')
  })
  it('only the bare #discover/<sub> keeps the top bar and the Jack button', () => {
    expect(isDiscoverSubRoot('#discover/learn')).toBe(true)
    expect(isDiscoverSubRoot('#discover/learn/article-1')).toBe(false)
    expect(isDiscoverSubRoot('#discover/nope')).toBe(false)
    expect(isDiscoverSubRoot('#discover')).toBe(false)
  })
})
