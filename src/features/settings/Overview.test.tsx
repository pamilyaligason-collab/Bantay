import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const acct = { member: null as null | { userId: string; personId: string; role: 'member' | 'admin' }, loaded: true }
vi.mock('../auth/client', () => ({ supabase: {} })) // sign-in is set up on this copy
vi.mock('./useAccount', () => ({ useAccount: () => ({ ...acct, who: 'Rey', passkey: false, photo: null }) }))
vi.mock('../privacy/ConsentNotice', () => ({ ConsentNotice: () => null }))
vi.mock('../viewas/ViewAsRow', () => ({ default: () => null }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: false, personId: null, name: '' }) }))

import Overview from './Overview'

afterEach(cleanup)

describe('Settings overview: rows that need an account', () => {
  it('signed out on a copy with sign-in set up: no Family and sharing, no Sign-in, one line says why', () => {
    acct.member = null
    render(<Overview />)
    expect(screen.queryByRole('link', { name: /Family and sharing/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Sign-in/ })).toBeNull()
    expect(screen.getByText('Family and sign-in rows show after you sign in.')).toBeTruthy()
    for (const n of ['Display', 'Phone', 'Privacy', 'About']) expect(screen.getByRole('link', { name: new RegExp(n) })).toBeTruthy()
  })
  it('signed in: both rows show and the line is gone', () => {
    acct.member = { userId: 'u1', personId: 'p1', role: 'member' }
    render(<Overview />)
    expect(screen.getByRole('link', { name: /Family and sharing/ }).getAttribute('href')).toBe('#me/family')
    expect(screen.getByRole('link', { name: /Sign-in/ }).getAttribute('href')).toBe('#me/signin')
    expect(screen.queryByText(/rows show after you sign in/)).toBeNull()
  })
  it('before the session read answers nothing is hidden', () => {
    acct.member = null; acct.loaded = false
    render(<Overview />)
    expect(screen.getByRole('link', { name: /Family and sharing/ })).toBeTruthy()
    acct.loaded = true
  })
})

describe('Settings overview: Admin dashboard row (S30 L4)', () => {
  it('an admin gets a link straight to the members page of the web admin', () => {
    acct.member = { userId: 'u1', personId: 'p1', role: 'admin' }
    render(<Overview />)
    expect(screen.getByRole('link', { name: /Admin dashboard/ }).getAttribute('href')).toBe('/admin#/members')
  })
  it('a member does not see it', () => {
    acct.member = { userId: 'u1', personId: 'p1', role: 'member' }
    render(<Overview />)
    expect(screen.queryByRole('link', { name: /Admin dashboard/ })).toBeNull()
  })
})
