import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

const member = vi.hoisted(() => ({ role: 'member' }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ personId: 'p1', role: member.role }) }))
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
