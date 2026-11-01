import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import FirstAidList from './FirstAidList'
import { FLAGS } from './flags'

afterEach(cleanup)

describe('FirstAidList', () => {
  it('lists all 17 topics, CPR hero first, Tagalog lines tagged', () => {
    render(<FirstAidList />)
    const list = screen.getByRole('list', { name: 'All 17 topics' })
    const links = within(list).getAllByRole('link')
    expect(links).toHaveLength(17)
    expect(screen.getAllByRole('link')[0]!.getAttribute('href')).toBe('tel:911')
    expect(screen.getAllByRole('link', { name: /CPR/ })[0]!.getAttribute('href')).toBe('#safety/firstaid/cpr')
    expect(links.every((a) => a.querySelector('[lang="fil"]') || a.textContent!.length > 0)).toBe(true)
    expect(document.querySelectorAll('[lang="fil"]').length).toBeGreaterThan(10)
  })
  it('shows no Saved chips or Offline section while the flag is off', () => {
    expect(FLAGS.firstAidOffline).toBe(false)
    render(<FirstAidList />)
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.queryByText('Offline copies')).toBeNull()
    expect(screen.queryByText('Offline')).toBeNull()
  })
})
