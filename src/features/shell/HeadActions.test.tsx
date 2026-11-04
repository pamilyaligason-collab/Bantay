import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnreadContext } from '../today/unread'
import { HeadActions } from './HeadActions'

vi.mock('../auth/session', () => ({ getMember: async () => ({ personId: 'p1', role: 'admin' }) }))
vi.mock('../auth/family', () => ({ loadFamily: () => [{ personId: 'p1', displayName: 'ana cruz' }] }))
vi.mock('../sync/SyncStatus', () => ({ SyncStatus: () => <i data-testid="sync" /> }))
afterEach(cleanup)

describe('HeadActions', () => {
  it('children first, then sync, bell, avatar; no Admin key', async () => {
    const { container } = render(<HeadActions><button type="button">Mine</button></HeadActions>)
    const kids = Array.from(container.querySelector('.lt-actions-set')!.children).map((e) => e.getAttribute('data-testid') ?? e.textContent)
    expect(kids).toEqual(['Mine', 'sync', 'head-bell', 'head-me'])
    expect(await screen.findByText('A')).toBeTruthy() // first-name initial
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    expect(screen.getByTestId('head-me').getAttribute('href')).toBe('#me')
  })
  it('bell names the unread count and shows a dot; none when 0', () => {
    const { container, rerender } = render(<UnreadContext.Provider value={3}><HeadActions /></UnreadContext.Provider>)
    expect(screen.getByTestId('head-bell').getAttribute('aria-label')).toBe('Notifications, 3 new')
    expect(container.querySelector('.ha-dot')).not.toBeNull()
    rerender(<UnreadContext.Provider value={0}><HeadActions /></UnreadContext.Provider>)
    expect(screen.getByTestId('head-bell').getAttribute('aria-label')).toBe('Notifications')
    expect(container.querySelector('.ha-dot')).toBeNull()
  })
})
