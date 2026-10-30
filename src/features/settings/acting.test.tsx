import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
const acting = vi.hoisted(() => ({ on: true }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: acting.on, personId: acting.on ? 'm1' : null, name: acting.on ? 'Mama' : '' }) }))
vi.mock('../privacy/ConsentNotice', () => ({ ConsentNotice: () => <p>consent notice</p> }))
vi.mock('../auth/session', async (orig) => ({ ...(await orig<typeof import('../auth/session')>()), getMember: async () => ({ userId: 'u0', personId: 'p0', role: 'member' }) }))
import Me from '../../screens/Me'

beforeEach(async () => { await db.kv.clear(); localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p0', displayName: 'Lloyd', handle: null, provider: 'pin' }])) })
afterEach(() => { cleanup(); localStorage.clear(); location.hash = '' })

describe('Settings while an admin is acting (W-28)', () => {
  it('Family and sharing, Privacy and Sign-in show a lock and "View only" and are not links; the others stay open', async () => {
    location.hash = '#me'
    const { container } = render(<Me />)
    await screen.findByRole('switch', { name: 'Simple mode' })
    const locked = Array.from(container.querySelectorAll('.st-list [aria-disabled="true"]')).map((r) => [r.querySelector('b')?.textContent, r.textContent?.includes('View only'), r.tagName])
    expect(locked).toEqual([['Family and sharing', true, 'DIV'], ['Privacy', true, 'DIV'], ['Sign-in', true, 'DIV']])
    for (const n of ['Alerts and reminders', 'Display', 'Phone', 'About']) expect(screen.getByRole('link', { name: new RegExp(n) })).toBeTruthy()
    expect(screen.queryByText('consent notice')).toBeNull() // ensureConsent writes consent_at: not while acting
  })
  it('the write rows inside Family and sharing are off too (a hash can reach the group)', async () => {
    location.hash = '#me/family'
    render(<Me />)
    await screen.findByRole('heading', { name: 'Family and sharing' })
    expect(screen.queryByRole('link', { name: /Who can see my records/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Who gets your SOS text/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Medical ID/ }).getAttribute('href')).toBe('#medid') // read-only
  })
  it('Edit name and photo is off and shows the lock with "View only"', async () => {
    location.hash = '#me'
    render(<Me />)
    const edit = (await screen.findByRole('button', { name: 'Edit name and photo, view only' })) as HTMLButtonElement
    expect(edit.disabled).toBe(true)
    expect(edit.textContent).toContain('View only')
  })
  it('not acting: the consent notice is mounted and nothing is locked', async () => {
    acting.on = false
    location.hash = '#me'
    const { container } = render(<Me />)
    await screen.findByRole('switch', { name: 'Simple mode' })
    expect(screen.getByText('consent notice')).toBeTruthy()
    expect(container.querySelectorAll('[aria-disabled="true"]').length).toBe(0)
    expect((await screen.findByRole('button', { name: 'Edit name and photo' }) as HTMLButtonElement).disabled).toBe(false)
    acting.on = true
  })
})
