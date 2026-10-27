import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/client', () => ({ supabase: {}, supabaseUrl: 'https://x.test', supabasePublishableKey: 'k' }))
import ForgotFlow from './ForgotFlow'
import type { FamilyMember } from '../auth/family'

const MAMA: FamilyMember = { personId: 'p-mama', displayName: 'Mama Rosa', handle: 'mama', provider: 'pin', initials: 'MR' }
const START = { id: 'r1', secret: 'sec', code: '4821' }
const key = (n: string) => screen.getByRole('button', { name: n })
const enter = (digits: string) => { for (const d of digits) fireEvent.click(key(d)) }

beforeEach(() => {
  localStorage.setItem('bantay.family', JSON.stringify([
    { personId: 'p-mama', displayName: 'Mama Rosa', handle: 'mama', provider: 'pin' },
    { personId: 'p-joy', displayName: 'Ate Joy', handle: 'joy', provider: 'pin' },
    { personId: 'p-ben', displayName: 'Kuya Ben', handle: 'ben', provider: 'pin' }
  ]))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers() })

const setup = (over: Partial<Parameters<typeof ForgotFlow>[0]> = {}) => {
  const start = vi.fn(async () => ({ ok: true as const, start: START }))
  const complete = vi.fn(async () => ({ ok: false as const, why: 'not_approved' as const }))
  const signIn = vi.fn(async () => null as string | null)
  const google = vi.fn()
  render(<ForgotFlow member={MAMA} onBack={() => undefined} google={google} start={start} complete={complete} signIn={signIn} delay={() => 20} {...over} />)
  return { start, complete, signIn, google }
}

describe('ForgotFlow', () => {
  it('shows two ways back in and no fingerprint route, no admin', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Forgot your PIN?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ask a family member to approve/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Sign in with Google/ })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/admin|fingerprint/i)
  })

  it('Google goes straight to Google sign-in', () => {
    const { google } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Google/ }))
    expect(google).toHaveBeenCalledTimes(1)
  })

  it('new PIN twice, then the code screen, polling until approved, then signs in with the new PIN', async () => {
    const { start, complete, signIn } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Ask a family member to approve/ }))
    expect(screen.getByRole('heading', { name: 'Choose a new PIN' })).toBeTruthy()
    enter('246810')
    expect(screen.getByRole('heading', { name: 'Type it again' })).toBeTruthy()
    enter('246810')
    await waitFor(() => expect(start).toHaveBeenCalledWith('mama', 'family'))
    expect(await screen.findByText('4821')).toBeTruthy() // the number to read out
    expect(screen.getByText(/open Bantay and tap Approve/)).toBeTruthy()
    expect(document.body.textContent).toContain('Ate Joy and Kuya Ben') // the other family members, not Mama herself
    await waitFor(() => expect(complete.mock.calls.length).toBeGreaterThan(1)) // keeps polling while not approved
    expect(complete).toHaveBeenCalledWith(START, '246810')
    expect(signIn).not.toHaveBeenCalled()
    complete.mockResolvedValue({ ok: true } as never)
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('mama', '246810'))
  })

  it('two different PINs start over with a red line and never call the server', async () => {
    const { start } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Ask a family member to approve/ }))
    enter('246810')
    enter('246811')
    expect((await screen.findByRole('alert')).textContent).toBe('Those two did not match. Start again.')
    expect(screen.getByRole('heading', { name: 'Choose a new PIN' })).toBeTruthy()
    expect(start).not.toHaveBeenCalled()
  })

  it('an expired request ends the poll and offers to start again', async () => {
    const complete = vi.fn(async () => ({ ok: false as const, why: 'expired' as const }))
    setup({ complete })
    fireEvent.click(screen.getByRole('button', { name: /Ask a family member to approve/ }))
    enter('246810'); enter('246810')
    expect((await screen.findByRole('alert')).textContent).toContain('ran out of time')
    const n = complete.mock.calls.length
    await new Promise((r) => setTimeout(r, 80))
    expect(complete.mock.calls.length).toBe(n) // stopped
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(screen.getByRole('heading', { name: 'Forgot your PIN?' })).toBeTruthy()
  })

  it('a rate-limited start shows the reason on the PIN screen', async () => {
    setup({ start: vi.fn(async () => ({ ok: false as const, why: 'rate_limited' as const })) })
    fireEvent.click(screen.getByRole('button', { name: /Ask a family member to approve/ }))
    enter('246810'); enter('246810')
    expect((await screen.findByRole('alert')).textContent).toContain('Too many requests')
  })

  it('real delay wiring: first poll at 10 s, a 429 re-arms at 30 s, stops at 30 min, check again polls at once and restarts', async () => {
    vi.useFakeTimers()
    const complete = vi.fn(async () => ({ ok: false as const, why: 'not_approved' as const }))
    complete.mockResolvedValueOnce({ ok: false as const, why: 'rate_limited' as const } as never)
    const start = vi.fn(async () => ({ ok: true as const, start: START }))
    render(<ForgotFlow member={MAMA} onBack={() => undefined} google={() => undefined} start={start} complete={complete} signIn={async () => null} />)
    const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
    fireEvent.click(screen.getByRole('button', { name: /Ask a family member to approve/ }))
    enter('246810'); enter('246810')
    await tick(0)
    expect(screen.getByText('4821')).toBeTruthy()
    await tick(9_999); expect(complete).toHaveBeenCalledTimes(0)
    await tick(1); expect(complete).toHaveBeenCalledTimes(1) // first poll at 10 s: rate_limited
    await tick(29_999); expect(complete).toHaveBeenCalledTimes(1) // slow down: next at 30 s, not 10 s
    await tick(1); expect(complete).toHaveBeenCalledTimes(2)
    expect(screen.getByText('4821')).toBeTruthy() // 429 keeps waiting
    expect(screen.queryByRole('alert')).toBeNull()
    for (let i = 0; i < 64; i++) await tick(30_000) // 32 minutes of 30 s steps (effects re-arm between acts): past the 30 minute give-up
    expect(screen.getByRole('button', { name: 'Still waiting - check again' })).toBeTruthy()
    const n = complete.mock.calls.length
    await tick(10 * 60_000); expect(complete.mock.calls.length).toBe(n) // stopped
    fireEvent.click(screen.getByRole('button', { name: 'Still waiting - check again' }))
    await tick(0); expect(complete.mock.calls.length).toBe(n + 1) // polls at once
    expect(screen.queryByRole('button', { name: 'Still waiting - check again' })).toBeNull()
    await tick(9_999); expect(complete.mock.calls.length).toBe(n + 1)
    await tick(1); expect(complete.mock.calls.length).toBe(n + 2) // restarted at 10 s
  })
})
