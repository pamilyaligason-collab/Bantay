import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'

const h = vi.hoisted(() => ({ role: 'member' as 'member' | 'admin', carerOf: ['pLola', 'p0'] as string[] }))
vi.mock('../features/auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p0', role: h.role, handle: null }), signOut: vi.fn(), getAccessToken: async () => null }))
vi.mock('../features/family/reportData', () => ({ loadCarerOf: async () => h.carerOf }))
vi.mock('../features/sos/call', () => ({ callPermission: async () => 'unavailable', requestCallPermission: vi.fn() }))
import Me from './Me'

const FAMILY = [{ personId: 'p0', displayName: 'Mama' }, { personId: 'pLola', displayName: 'Lola' }].map((m) => ({ ...m, handle: null, provider: 'pin' }))

beforeEach(async () => { h.role = 'member'; h.carerOf = ['pLola', 'p0']; await db.kv.clear(); localStorage.setItem('bantay.family', JSON.stringify(FAMILY)) })
afterEach(() => { cleanup(); localStorage.clear(); location.hash = '' })

describe('Me, people I look after and the version line (start-me)', () => {
  it('lists each person the member is a carer of by name and links to their page, never themself', async () => {
    location.hash = '#me/family' // Settings > Family and sharing
    render(<Me />)
    const row = await screen.findByRole('link', { name: /Lola/ })
    expect(row.getAttribute('href')).toBe('#family/people/pLola')
    expect(row.textContent).toContain('You are their carer')
    expect(screen.queryAllByRole('link', { name: /You are their carer/ })).toHaveLength(1)
  })
  it('a member who looks after nobody sees no such row', async () => {
    h.carerOf = []
    location.hash = '#me/family'
    render(<Me />)
    await screen.findByRole('link', { name: /Medical ID/ })
    await new Promise((r) => setTimeout(r, 50)) // the carer list loads after first paint
    expect(screen.queryByText(/You are their carer/)).toBeNull()
  })
  it('every member sees "Bantay <version>" with "Not checked yet" until a real check ran; no Check button for non-admins', async () => {
    location.hash = '#me/about'
    render(<Me />)
    expect((await screen.findByText(/^Bantay /)).textContent).toMatch(/^Bantay \S+/)
    expect(screen.getByText('Not checked yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
  })
  it('an admin keeps the Check for updates row', async () => {
    h.role = 'admin'
    location.hash = '#me/about'
    render(<Me />)
    expect(await screen.findByRole('button', { name: 'Check for updates' })).toBeTruthy()
  })
})
