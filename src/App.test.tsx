import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

beforeEach(() => {
  location.hash = ''
})
afterEach(cleanup)

describe('tab shell', () => {
  it('renders Today, Health, Discover, Family, Safety (no Ask tab)', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toEqual(['Today', 'Health', 'Discover', 'Family', 'Safety'])
  })

  it('defaults to Today with aria-current on its tab', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Today')
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Health' }).getAttribute('aria-current')).toBe('false')
  })

  it('click writes the hash and switches screen', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Health' }))
    expect(location.hash).toBe('#health')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Health'))
  })

  it('old #records and #family/records links land on Health > Papers', async () => {
    for (const old of ['#records', '#family/records']) {
      location.hash = old
      const { unmount } = render(<App />)
      await waitFor(() => expect(location.hash).toBe('#health/papers'))
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Papers'))
      expect(screen.getByRole('button', { name: 'Health' }).getAttribute('aria-current')).toBe('page')
      unmount()
    }
  })

  it('the floating Jack button opens the assistant on a tap and the choice sheet on a hold; the tab bar has no Ask slot', async () => {
    render(<App />)
    expect(document.querySelector('.as-fab')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Main' }).querySelector('[aria-label="Ask Bantay"]')).toBeNull()
    const jack = await screen.findByRole('button', { name: 'Ask Bantay' })
    fireEvent.click(jack)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Ask Bantay' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.contextMenu(jack)
    fireEvent.click(await screen.findByRole('button', { name: /Talk to Jack Jack/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Ask Bantay' })).toBeTruthy())
  })

  it('Discover is the third tab: its sub-tabs show, the tab is current, and Jack stays on it', async () => {
    location.hash = '#discover/play'
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Discover'))
    expect(screen.getByRole('button', { name: 'Discover' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByRole('button', { name: 'Ask Bantay' })).toBeTruthy()
  })

  it('full views and own-header pages have no Jack button', async () => {
    for (const h of ['#privacy', '#sharing', '#me', '#weather']) {
      location.hash = h
      const { unmount } = render(<App />)
      await new Promise((r) => setTimeout(r, 30))
      expect(screen.queryByRole('button', { name: 'Ask Bantay' }), h).toBeNull()
      unmount()
    }
  })

  it('deep-links from the hash and follows hashchange', async () => {
    location.hash = '#safety'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Safety')
    location.hash = '#family'
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Family'))
  })

  it('unknown hash falls back to Today', () => {
    location.hash = '#nope'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Today')
  })
})
