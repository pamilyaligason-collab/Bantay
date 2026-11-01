import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDiscoverSubRoot, registerSub, subOf } from '../features/discover'
import { SeasonRow } from '../features/discover/today/Cards'
import Discover from './Discover'

beforeEach(() => { location.hash = '#discover' })
afterEach(cleanup)

const day = (m: number, d: number) => new Date(2026, m - 1, d, 10, 20)

describe('Discover overview (#discover)', () => {
  it('draws the large title and one hero, then season, Learn and the rest in order; no tile grid, no pill row', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(day(10, 28)) // Undas, so the season row shows
    const { container } = render(<Discover />)
    vi.useRealTimers()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(screen.getByTestId('dc-head')).toBeTruthy()
    expect(container.querySelectorAll('[data-hero]').length).toBe(1)
    const ids = ['dc-hero', 'season-row', 'dc-learn']
    const els = ids.map((i) => screen.getByTestId(i))
    els.slice(1).forEach((e, i) => expect(els[i]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(screen.queryByTestId('discover-tiles')).toBeNull()
    expect(screen.queryByTestId('pick')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Discover sections' })).toBeNull()
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
