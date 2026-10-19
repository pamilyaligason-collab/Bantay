import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  abandon: vi.fn(), pk: vi.fn(), pin: vi.fn(async () => null as string | null), reset: vi.fn(async () => 'sent' as const),
  names: vi.fn(async () => ({ kind: 'error' }) as { kind: string; names?: { first_name: string; initial: string; handle: string }[] })
}))
vi.mock('../features/auth/client', () => ({ supabase: {} }))
vi.mock('../features/look', () => ({ Sky: () => null }))
vi.mock('../features/auth/pinLogin', () => ({
  signInWithGoogle: vi.fn(async () => null), signInWithPin: h.pin, requestPinReset: h.reset, fetchFamilyNames: h.names,
  SIGN_IN_ERROR: 'Handle or PIN is not right', NO_SIGNAL: 'No signal. Try again when you have data.'
}))
vi.mock('../features/auth/family', async () => ({ ...(await vi.importActual<typeof import('../features/auth/family')>('../features/auth/family')), signInWithPasskey: h.pk, abandonPasskeyWait: h.abandon }))

import SignIn from './SignIn'
import { signInWithGoogle } from '../features/auth/pinLogin'
import { db } from '../db'

const FAMILY = [
  { personId: 'p-lola', displayName: 'Lola Rosa', handle: 'lola', provider: 'pin' },
  { personId: 'p-kuya', displayName: 'Kuya Ben', handle: 'ben', provider: 'pin' }
]
const pad = () => screen.queryByRole('button', { name: '5' })
const tap = (n: RegExp) => fireEvent.click(screen.getByRole('button', { name: n }))
const choose = (name: string) => { fireEvent.click(within(screen.getByLabelText('Who are you?')).getByRole('button', { name })) }

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

  it('trusted phone, nobody remembered: Jack Jack greets, a tappable list shows the family, tapping a name opens the PIN pad', () => {
    render(<SignIn />)
    expect(screen.getByRole('heading', { name: "Hi! I'm Jack Jack." })).toBeTruthy()
    expect(screen.getByAltText('Jack Jack, the Bantay dog')).toBeTruthy()
    expect(screen.getByText(/I watch over the family's health and safety\. Who are you\?/)).toBeTruthy()
    const list = screen.getByLabelText('Who are you?')
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['LRLola Rosa', 'KBKuya Ben'])
    expect(screen.queryByRole('combobox')).toBeNull()
    choose('Kuya Ben')
    expect(screen.getByRole('heading', { name: 'Kuya Ben' })).toBeTruthy()
    expect(pad()).not.toBeNull()
    expect(screen.queryByAltText('Jack Jack, the Bantay dog')).toBeNull() // the picked person's card has no mascot unless returning
  })

  it('an admin in the cached family shows an Admin sub-line in the welcome list', () => {
    localStorage.setItem('bantay.family', JSON.stringify([...FAMILY, { personId: 'p-ate', displayName: 'Ate Maria', handle: null, provider: 'google' }]))
    render(<SignIn />)
    const rows = within(screen.getByLabelText('Who are you?')).getAllByRole('button')
    expect(rows.map((b) => b.textContent)).toEqual(['LRLola Rosa', 'KBKuya Ben', 'AMAte MariaAdmin'])
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

  it('Not you? Switch person shows the welcome list', () => {
    localStorage.setItem('bantay.lastPerson', 'p-kuya')
    render(<SignIn />)
    tap(/Not you\? Switch person/)
    expect(screen.getByLabelText('Who are you?')).toBeTruthy()
    expect(screen.getAllByAltText('Jack Jack, the Bantay dog')).toHaveLength(1) // the welcome Jack, not the returning avatar
    expect(screen.queryByRole('heading', { name: 'Kuya Ben' })).toBeNull()
  })

  it('a remembered person who left the family list falls back to the welcome list', () => {
    localStorage.setItem('bantay.lastPerson', 'p-gone')
    render(<SignIn />)
    expect(screen.getByLabelText('Who are you?')).toBeTruthy()
  })

  it('untrusted phone, names function failing: no names, no list, handle and PIN form on offer', async () => {
    localStorage.clear()
    h.names.mockResolvedValue({ kind: 'error' })
    render(<SignIn />)
    expect(await screen.findByText(/First time on this phone/)).toBeTruthy()
    expect(screen.queryByLabelText('Who are you?')).toBeNull()
    expect(document.body.textContent).not.toContain('Lola')
  })
})

describe('SignIn: fresh phone name list (D-41)', () => {
  const NAMES = [{ first_name: 'Kuya', initial: 'B', handle: 'ben' }, { first_name: 'Lola', initial: 'R', handle: 'lola' }]
  beforeEach(async () => { localStorage.clear(); await db.kv.clear(); h.pin.mockReset(); h.names.mockReset() })
  afterEach(() => cleanup())

  it('lists first names from the server and signs in with the chosen handle; nothing is cached', async () => {
    h.names.mockResolvedValue({ kind: 'ok', names: NAMES })
    h.pin.mockResolvedValue('Handle or PIN is not right')
    render(<SignIn />)
    const list = await screen.findByLabelText('Who are you?')
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['KBKuya B.', 'LRLola R.'])
    fireEvent.click(within(list).getByRole('button', { name: 'Lola R.' }))
    for (const d of '111222') fireEvent.click(screen.getByRole('button', { name: d }))
    await waitFor(() => expect(h.pin).toHaveBeenCalledWith('lola', '111222'))
    expect(localStorage.getItem('bantay.family')).toBeNull()
  })

  it('offline: says No signal, offers Try again, and the handle and PIN form still works', async () => {
    h.names.mockResolvedValue({ kind: 'offline' })
    render(<SignIn />)
    expect(await screen.findByText('No signal. Try again when you have data.')).toBeTruthy()
    expect(screen.queryByLabelText('Who are you?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with your name and PIN' }))
    expect(screen.getByLabelText('Name')).toBeTruthy()
  })

  it('Try again after offline shows the list once the names arrive', async () => {
    h.names.mockResolvedValue({ kind: 'offline' })
    render(<SignIn />)
    await screen.findByText('No signal. Try again when you have data.')
    h.names.mockResolvedValue({ kind: 'ok', names: NAMES })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Who are you?')).toBeTruthy()
  })

  it('a phone with a cached family never asks the server for names', () => {
    localStorage.setItem('bantay.family', JSON.stringify(FAMILY))
    render(<SignIn />)
    expect(h.names).not.toHaveBeenCalled()
  })
})

describe('SignIn: PIN errors, lock, forgot PIN (P1 Task 5)', () => {
  const key = (n: string) => screen.getByRole('button', { name: n })
  const enter = async (digits: string) => { for (const d of digits) fireEvent.click(key(d)) }
  beforeEach(async () => {
    localStorage.clear(); h.pin.mockReset(); h.reset.mockClear(); await db.kv.clear()
    localStorage.setItem('bantay.family', JSON.stringify([...FAMILY, { personId: 'p-ate', displayName: 'Ate Maria', handle: null, provider: 'google' }]))
    localStorage.setItem('bantay.lastPerson', 'p-kuya')
  })
  afterEach(() => cleanup())

  it('a wrong PIN says how many tries are left (kept on the phone)', async () => {
    h.pin.mockResolvedValue('Handle or PIN is not right')
    render(<SignIn />)
    await enter('111222')
    expect((await screen.findByRole('alert')).textContent).toBe('That PIN did not work. 4 tries left before a 15-minute lock.')
    expect((await db.kv.get('pin.fail.ben'))?.value).toMatchObject({ n: 1 })
  })

  it('five failures show the locked screen and stop calling the server', async () => {
    h.pin.mockResolvedValue('Handle or PIN is not right')
    render(<SignIn />)
    for (let i = 0; i < 5; i++) { await enter('111222'); await waitFor(() => expect(h.pin).toHaveBeenCalledTimes(i + 1), { timeout: 5000 }) }
    expect(await screen.findByRole('heading', { name: 'PIN locked' }, { timeout: 12_000 })).toBeTruthy()
    expect(screen.getByText(/Locked until \d\d:\d\d, or ask an admin/)).toBeTruthy()
    expect(pad()).toBeNull()
  })

  it('a locked person stays locked after reopening the app', async () => {
    await db.kv.put({ key: 'pin.fail.ben', value: { n: 5, lastAt: Date.now() } })
    render(<SignIn />)
    expect(await screen.findByRole('heading', { name: 'PIN locked' })).toBeTruthy()
  })

  it('no signal is not counted as a wrong PIN', async () => {
    h.pin.mockResolvedValue('No signal. Try again when you have data.')
    render(<SignIn />)
    await enter('111222')
    expect((await screen.findByRole('alert')).textContent).toBe('No signal. Try again when you have data.')
    expect(await db.kv.get('pin.fail.ben')).toBeUndefined()
  })

  it('a good PIN clears the count', async () => {
    await db.kv.put({ key: 'pin.fail.ben', value: { n: 2, lastAt: Date.now() } })
    h.pin.mockResolvedValue(null)
    render(<SignIn />)
    await enter('483920')
    await waitFor(async () => expect(await db.kv.get('pin.fail.ben')).toBeUndefined())
  })

  it('An admin unlocked me clears the phone-side lock and shows the PIN pad', async () => {
    await db.kv.put({ key: 'pin.fail.ben', value: { n: 5, lastAt: Date.now() } })
    render(<SignIn />)
    fireEvent.click(await screen.findByRole('button', { name: 'An admin unlocked me' }))
    await waitFor(() => expect(pad()).not.toBeNull())
    expect(await db.kv.get('pin.fail.ben')).toBeUndefined()
  })

  it('the lock clears by itself when the lock time passes', async () => {
    await db.kv.put({ key: 'pin.fail.ben', value: { n: 5, lastAt: Date.now() - 15 * 60_000 + 5000 } })
    render(<SignIn />)
    expect(await screen.findByRole('heading', { name: 'PIN locked' })).toBeTruthy()
    await waitFor(() => expect(pad()).not.toBeNull(), { timeout: 12_000 })
    expect(await db.kv.get('pin.fail.ben')).toBeUndefined()
  })

  it('Forgot PIN opens Ask an admin, names the admins (no Call buttons) and sends the request for that handle', async () => {
    render(<SignIn />)
    tap(/Forgot PIN\? Ask an admin/)
    expect(await screen.findByRole('heading', { name: 'Ask an admin' })).toBeTruthy()
    expect(screen.getByLabelText('Admins').textContent).toContain('Ate Maria')
    expect(screen.getByText('Ask Ate or an admin in person or by message. Or send a request:')).toBeTruthy()
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['tel:911']) // only the emergency link, no Call buttons
    tap(/Send a request/)
    await waitFor(() => expect(h.reset).toHaveBeenCalledWith('ben'))
    expect((await screen.findByText(/Request sent/))).toBeTruthy()
  })

  it('Emergency call 911 is on every sign-in screen', () => {
    render(<SignIn />)
    expect(screen.getByRole('link', { name: 'Emergency call 911' }).getAttribute('href')).toBe('tel:911')
  })
})

describe('SignIn: Google for admins', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => cleanup())
  it('shows the Chrome waiting screen while Google sign-in is pending', async () => {
    vi.mocked(signInWithGoogle).mockReturnValue(new Promise(() => {}))
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: /Admin\? Continue with Google/ }))
    expect(await screen.findByText(/Finishing sign-in in Chrome/)).toBeTruthy()
    expect(screen.getByRole('button', { name: "I'm back" })).toBeTruthy()
  })
})

describe('SignIn: photos from family_profiles', () => {
  afterEach(() => cleanup())
  it('shows a member photo in the list and the big avatar, initials when there is none', () => {
    localStorage.clear()
    localStorage.setItem('bantay.family', JSON.stringify(FAMILY))
    localStorage.setItem('bantay.avatars', JSON.stringify({ 'p-lola': { path: 'p-lola.jpg', url: 'data:image/jpeg;base64,AAAA' } }))
    render(<SignIn />)
    const list = within(screen.getByLabelText('Who are you?'))
    expect(list.getByRole('button', { name: /Lola Rosa/ }).querySelector('img.avatar')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA')
    expect(list.getByRole('button', { name: /Kuya Ben/ }).querySelector('img')).toBeNull()
    choose('Lola Rosa')
    expect(document.querySelector('.pickcard img.avatar.big')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA')
  })
})
