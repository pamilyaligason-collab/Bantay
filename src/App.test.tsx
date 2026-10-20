import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

beforeEach(() => {
  location.hash = ''
})
afterEach(cleanup)

describe('tab shell', () => {
  it('renders Today, Health, centre Ask, Family, Safety', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toEqual(['Today', 'Health', 'Ask', 'Family', 'Safety'])
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

  it('centre Ask opens the assistant; no floating button remains', async () => {
    render(<App />)
    expect(document.querySelector('.as-fab')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ask Bantay' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Ask Bantay' })).toBeTruthy())
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
