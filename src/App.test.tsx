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

  it('#records opens Family with Records selected; People switches back', async () => {
    location.hash = '#records'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Family')
    expect(screen.getByRole('button', { name: 'Family' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Records' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'People' }))
    expect(location.hash).toBe('#family')
    await waitFor(() => expect(screen.getByRole('button', { name: 'People' }).getAttribute('aria-pressed')).toBe('true'))
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
