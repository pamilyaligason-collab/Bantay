import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ abandon: vi.fn(), pk: vi.fn(), pin: vi.fn(async () => null as string | null) }))
vi.mock('../features/auth/client', () => ({ supabase: {} }))
vi.mock('../features/look', () => ({ Sky: () => null }))
vi.mock('../features/auth/pinLogin', () => ({ signInWithGoogle: vi.fn(async () => null), signInWithPin: h.pin }))
vi.mock('../features/auth/family', async () => ({ ...(await vi.importActual<typeof import('../features/auth/family')>('../features/auth/family')), signInWithPasskey: h.pk, abandonPasskeyWait: h.abandon }))

import SignIn from './SignIn'

const FAMILY = [
  { personId: 'p-lola', displayName: 'Lola Rosa', handle: 'lola', provider: 'pin' },
  { personId: 'p-kuya', displayName: 'Kuya Ben', handle: 'ben', provider: 'pin' }
]
const pad = () => screen.queryByRole('button', { name: '5' })
const tap = (n: RegExp) => fireEvent.click(screen.getByRole('button', { name: n }))

describe('SignIn: fingerprint first (D-27)', () => {
  const credsDesc = Object.getOwnPropertyDescriptor(navigator, 'credentials')
  beforeEach(() => {
    localStorage.clear(); h.pk.mockReset(); h.pin.mockClear()
    localStorage.setItem('bantay.family', JSON.stringify(FAMILY))
    localStorage.setItem('bantay.passkey.p-lola', '1')
    vi.stubGlobal('PublicKeyCredential', class {})
    Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true })
  })
  afterEach(() => {
    cleanup(); vi.unstubAllGlobals()
    if (credsDesc) Object.defineProperty(navigator, 'credentials', credsDesc); else delete (navigator as { credentials?: unknown }).credentials
  })

  it('person with fingerprint on: prompt starts at once, PIN pad is hidden but one tap away', async () => {
    h.pk.mockReturnValue(new Promise(() => {}))
    render(<SignIn />)
    tap(/Lola Rosa/)
    expect(h.pk).toHaveBeenCalledTimes(1)
    expect(h.pk).toHaveBeenCalledWith('p-lola')
    expect(pad()).toBeNull()
    tap(/Use PIN instead/)
    expect(h.abandon).toHaveBeenCalledTimes(1)
    expect(pad()).not.toBeNull()
    expect(h.pk).toHaveBeenCalledTimes(1)
  })

  for (const [name, msg] of [
    ['cancel or error', 'Fingerprint or face did not work. Use your PIN instead.'],
    ['identity mismatch', 'That fingerprint belongs to someone else. Tap your own name.']
  ] as const) {
    it(`${name}: PIN pad shows with the message, no automatic second prompt`, async () => {
      h.pk.mockResolvedValue(msg)
      render(<SignIn />)
      tap(/Lola Rosa/)
      await waitFor(() => expect(pad()).not.toBeNull())
      expect(screen.getByRole('alert').textContent).toBe(msg)
      await new Promise((r) => setTimeout(r, 30))
      expect(h.pk).toHaveBeenCalledTimes(1)
      // Only a deliberate tap asks again.
      tap(/Use fingerprint or face/)
      expect(h.pk).toHaveBeenCalledTimes(2)
    })
  }

  it('picking again after a failure starts the prompt again (once)', async () => {
    h.pk.mockResolvedValue('nope')
    render(<SignIn />)
    tap(/Lola Rosa/)
    await waitFor(() => expect(pad()).not.toBeNull())
    tap(/Back/)
    tap(/Lola Rosa/)
    expect(h.pk).toHaveBeenCalledTimes(2)
  })

  it('person without fingerprint on this phone gets the PIN pad and no prompt', () => {
    render(<SignIn />)
    tap(/Kuya Ben/)
    expect(h.pk).not.toHaveBeenCalled()
    expect(pad()).not.toBeNull()
    expect(screen.queryByRole('button', { name: /fingerprint/i })).toBeNull()
  })

  it('browser without passkeys: PIN pad even if a flag is stored', () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    render(<SignIn />)
    tap(/Lola Rosa/)
    expect(h.pk).not.toHaveBeenCalled()
    expect(pad()).not.toBeNull()
  })
})
