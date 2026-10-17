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
const choose = (name: string) => { fireEvent.change(screen.getByLabelText('Who are you?'), { target: { value: FAMILY.find((f) => f.displayName === name)!.personId } }); tap(/Continue/) }

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
    choose('Lola Rosa')
    expect(h.pk).toHaveBeenCalledTimes(1)
    expect(h.pk).toHaveBeenCalledWith('p-lola')
    expect(pad()).toBeNull()
    const n = h.abandon.mock.calls.length
    tap(/Use PIN instead/)
    expect(h.abandon.mock.calls.length).toBe(n + 1)
    expect(pad()).not.toBeNull()
    expect(h.pk).toHaveBeenCalledTimes(1)
  })

  it('Use PIN instead: the aborted prompt failing afterwards shows no alert', async () => {
    let fail!: (e: string) => void
    h.pk.mockReturnValue(new Promise<string>((r) => { fail = r }))
    render(<SignIn />)
    choose('Lola Rosa')
    tap(/Use PIN instead/)
    fail('Fingerprint or face did not work. Use your PIN instead.')
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(pad()).not.toBeNull()
  })

  for (const [name, msg] of [
    ['cancel or error', 'Fingerprint or face did not work. Use your PIN instead.'],
    ['identity mismatch', 'That fingerprint belongs to someone else. Tap your own name.']
  ] as const) {
    it(`${name}: PIN pad shows with the message, no automatic second prompt`, async () => {
      h.pk.mockResolvedValue(msg)
      render(<SignIn />)
      choose('Lola Rosa')
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
    choose('Lola Rosa')
    await waitFor(() => expect(pad()).not.toBeNull())
    tap(/Back/)
    choose('Lola Rosa')
    expect(h.pk).toHaveBeenCalledTimes(2)
  })

  it('person without fingerprint on this phone gets the PIN pad and no prompt', () => {
    render(<SignIn />)
    choose('Kuya Ben')
    expect(h.pk).not.toHaveBeenCalled()
    expect(pad()).not.toBeNull()
    expect(screen.queryByRole('button', { name: /fingerprint/i })).toBeNull()
  })

  it('browser without passkeys: PIN pad even if a flag is stored', () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    render(<SignIn />)
    choose('Lola Rosa')
    expect(h.pk).not.toHaveBeenCalled()
    expect(pad()).not.toBeNull()
  })
})

describe('SignIn: dropdown and remembered person (Lloyd 2026-10-18)', () => {
  beforeEach(() => { localStorage.clear(); h.pk.mockReset(); localStorage.setItem('bantay.family', JSON.stringify(FAMILY)) })
  afterEach(() => cleanup())

  it('trusted phone, nobody remembered: labelled dropdown lists the family, Continue is off until a name is chosen', () => {
    render(<SignIn />)
    const sel = screen.getByLabelText('Who are you?') as HTMLSelectElement
    expect(Array.from(sel.options).map((o) => o.text)).toEqual(['Choose your name', 'Lola Rosa', 'Kuya Ben'])
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true)
    choose('Kuya Ben')
    expect(screen.getByRole('heading', { name: 'Kuya Ben' })).toBeTruthy()
    expect(pad()).not.toBeNull()
    expect(screen.queryByAltText('Jack Jack, the Bantay dog')).toBeNull() // mascot is for the returning screen only
  })

  it('remembered person: only that person, mascot, PIN pad at once, no dropdown, no other names', () => {
    localStorage.setItem('bantay.lastPerson', 'p-kuya')
    render(<SignIn />)
    expect(screen.getByAltText('Jack Jack, the Bantay dog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Kuya Ben' })).toBeTruthy()
    expect(pad()).not.toBeNull()
    expect(screen.queryByLabelText('Who are you?')).toBeNull()
    expect(document.body.textContent).not.toContain('Lola')
  })

  it('remembered person with fingerprint on: the prompt starts by itself', () => {
    localStorage.setItem('bantay.lastPerson', 'p-lola')
    localStorage.setItem('bantay.passkey.p-lola', '1')
    vi.stubGlobal('PublicKeyCredential', class {})
    Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true })
    h.pk.mockReturnValue(new Promise(() => {}))
    render(<SignIn />)
    expect(h.pk).toHaveBeenCalledWith('p-lola')
    vi.unstubAllGlobals()
    delete (navigator as { credentials?: unknown }).credentials
  })

  it('Not you? Switch person shows the dropdown', () => {
    localStorage.setItem('bantay.lastPerson', 'p-kuya')
    render(<SignIn />)
    tap(/Not you\? Switch person/)
    expect(screen.getByLabelText('Who are you?')).toBeTruthy()
    expect(screen.queryByAltText('Jack Jack, the Bantay dog')).toBeNull()
  })

  it('a remembered person who left the family list falls back to the dropdown', () => {
    localStorage.setItem('bantay.lastPerson', 'p-gone')
    render(<SignIn />)
    expect(screen.getByLabelText('Who are you?')).toBeTruthy()
  })

  it('untrusted phone: no names, no dropdown', () => {
    localStorage.clear()
    render(<SignIn />)
    expect(screen.queryByLabelText('Who are you?')).toBeNull()
    expect(document.body.textContent).not.toContain('Lola')
  })
})
