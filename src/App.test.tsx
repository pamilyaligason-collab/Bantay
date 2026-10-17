import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

beforeEach(() => {
  location.hash = ''
})
afterEach(cleanup)

describe('tab shell', () => {
  it('renders exactly the 5 tabs in order', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toEqual(['Today', 'Health', 'Records', 'Family', 'Safety'])
  })

  it('defaults to Today with aria-current on its tab', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Today')
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Health' }).getAttribute('aria-current')).toBe('false')
  })

  it('click writes the hash and switches screen', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Records' }))
    expect(location.hash).toBe('#records')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Records'))
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
