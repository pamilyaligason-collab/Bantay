import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar, firstName, isSubHash } from './TopBar'

const member = vi.hoisted(() => ({ role: 'member' }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ personId: 'p1', role: member.role }) }))
vi.mock('../auth/family', () => ({ loadFamily: () => [{ personId: 'p1', displayName: 'loyd roca' }] }))
vi.mock('../sync/SyncStatus', () => ({ SyncStatus: () => null }))
afterEach(cleanup)

describe('TopBar admin shield', () => {
  it('shows for admin', async () => {
    member.role = 'admin'
    render(<TopBar />)
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeTruthy()
  })
  it('hides for member', async () => {
    member.role = 'member'
    render(<TopBar />)
    await screen.findByRole('link', { name: 'Me and settings' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
  })
})

describe('TopBar greeting', () => {
  it('capitalises the first name', async () => {
    member.role = 'member'
    render(<TopBar />)
    expect(await screen.findByText(/, Loyd$/)).toBeTruthy()
    expect(firstName('  maria santos')).toBe('Maria')
    expect(firstName('')).toBe('')
  })
  it('compacts on sub-pages only', () => {
    expect(['#medid', '#gobag', '#docs/x', '#safety/map', '#health/metric/bp', '#family/people/p1'].every(isSubHash)).toBe(true)
    expect(['', '#today', '#health', '#family/plan', '#records', '#safety'].some(isSubHash)).toBe(false)
  })
  it('is compact (data-compact) off Today and roomy on Today', () => {
    for (const [h, want] of [['#health', 'true'], ['#family', 'true'], ['#safety', 'true'], ['#today', 'false']]) {
      location.hash = h
      const { container, unmount } = render(<TopBar />)
      expect(container.querySelector('.topbar')?.getAttribute('data-compact')).toBe(want)
      unmount()
    }
  })
})
