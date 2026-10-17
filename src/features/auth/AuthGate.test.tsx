import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'

// In unit tests there is no Supabase env, so the client is null.
describe('AuthGate without Supabase env', () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs() })

  it('dev/test: renders the app (documented bypass)', () => {
    render(<AuthGate><p>app</p></AuthGate>)
    expect(screen.getByText('app')).toBeTruthy()
  })
  it('production: shows an alert and never the app', () => {
    vi.stubEnv('PROD', true)
    render(<AuthGate><p>app</p></AuthGate>)
    expect(screen.getByRole('alert').textContent).toBe('Sign-in is not configured.')
    expect(screen.queryByText('app')).toBeNull()
  })
})
