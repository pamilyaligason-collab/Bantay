import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isDiscoverSubRoot, registerSub, subOf } from '../features/discover'
import Discover from './Discover'

beforeEach(() => { location.hash = '#discover' })
afterEach(cleanup)

describe('Discover tab', () => {
  it('has the five sub-tabs in order and Learn is on by default', () => {
    render(<Discover />)
    const tabs = screen.getByRole('group', { name: 'Discover sections' }).querySelectorAll('button')
    expect(Array.from(tabs).map((b) => b.textContent)).toEqual(['Learn', 'Listen', 'Play', 'Watch', 'News'])
    expect(screen.getByRole('button', { name: 'Learn' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Discover')
  })
  it('a sub nobody registered shows the short Coming in this update card', () => {
    location.hash = '#discover/watch'
    render(<Discover />)
    expect(screen.getByText('Coming in this update')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Watch' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('tapping a sub-tab writes #discover/<sub>', () => {
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
    expect(screen.getByText('Coming in this update')).toBeTruthy()
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
