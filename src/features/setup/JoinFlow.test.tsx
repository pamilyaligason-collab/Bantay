import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ names: vi.fn() }))
vi.mock('../auth/client', () => ({ supabase: {}, supabaseUrl: 'https://x.test', supabasePublishableKey: 'k' }))
vi.mock('../auth/pinLogin', async (orig) => ({ ...(await orig<object>()), fetchFamilyNames: h.names }))
vi.mock('../auth/session', () => ({ getMember: vi.fn(async () => null) }))
vi.mock('../auth/biometric', () => ({ unlockMode: vi.fn(async () => 'pin'), promptFingerprint: vi.fn(async () => false) }))
import JoinFlow, { defaultJoinPort, type JoinPort } from './JoinFlow'

const NAMES = [{ first_name: 'Mama', initial: '', handle: 'mama' }, { first_name: 'Papa', initial: 'R', handle: 'papa' }]
const okPort: JoinPort = async () => ({ ok: true })
const key = (n: string) => screen.getByRole('button', { name: n })
const enter = (digits: string) => { for (const d of digits) fireEvent.click(key(d)) }

beforeEach(() => { h.names.mockReset(); h.names.mockResolvedValue({ kind: 'ok', names: NAMES }) })
afterEach(() => cleanup())

describe('JoinFlow (start-who, start-pin)', () => {
  it('asks the server for the names on this invite and lists them', async () => {
    render(<JoinFlow invite="abcd1234efgh" port={okPort} onBack={() => undefined} />)
    const list = await screen.findByLabelText('Who are you?')
    expect(h.names).toHaveBeenCalledWith('abcd1234efgh')
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['MMama', 'PRPapa R.'])
    expect(screen.getByText('Step 1 of 3 · then Today')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/admin/i)
  })

  it('Jack Jack waves hello at 112 px, one picture (D-91)', async () => {
    render(<JoinFlow invite="abcd1234efgh" port={okPort} onBack={() => undefined} />)
    await screen.findByLabelText('Who are you?')
    const img = screen.getByAltText('Jack Jack waving hello')
    expect(img.getAttribute('width')).toBe('112')
    expect(document.querySelectorAll('img.jack')).toHaveLength(1)
  })

  it('tap a name, type the PIN twice, the port claims it, then the person is signed in', async () => {
    const port = vi.fn<JoinPort>(async () => ({ ok: true }))
    const signIn = vi.fn(async () => null as string | null)
    render(<JoinFlow invite="abcd1234efgh" port={port} signIn={signIn} onBack={() => undefined} />)
    fireEvent.click(within(await screen.findByLabelText('Who are you?')).getByRole('button', { name: /Mama/ }))
    expect(screen.getByRole('heading', { name: 'Hi Mama, choose a 6-digit PIN' })).toBeTruthy()
    expect(screen.getByText('Step 2 of 3 · then Today')).toBeTruthy()
    enter('135790')
    expect(screen.getByRole('heading', { name: 'Type it again' })).toBeTruthy()
    enter('135790')
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('mama', '135790'))
    expect(port).toHaveBeenCalledWith({ invite: 'abcd1234efgh', handle: 'mama', pin: '135790' })
  })

  it('mismatch clears the dots with a red line and does not call the server', async () => {
    const port = vi.fn<JoinPort>(async () => ({ ok: true }))
    render(<JoinFlow invite="abcd1234efgh" port={port} onBack={() => undefined} />)
    fireEvent.click(within(await screen.findByLabelText('Who are you?')).getByRole('button', { name: /Papa/ }))
    enter('135790'); enter('135791')
    expect((await screen.findByRole('alert')).textContent).toBe('Those two did not match. Start again.')
    expect(port).not.toHaveBeenCalled()
  })

  it('a refused claim shows its reason and signs nobody in', async () => {
    const signIn = vi.fn(async () => null as string | null)
    render(<JoinFlow invite="abcd1234efgh" port={async () => ({ ok: false, why: 'taken' })} signIn={signIn} onBack={() => undefined} />)
    fireEvent.click(within(await screen.findByLabelText('Who are you?')).getByRole('button', { name: /Mama/ }))
    enter('135790'); enter('135790')
    expect((await screen.findByRole('alert')).textContent).toContain('already has a PIN')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('the default port is the live pin-login join_claim, not a stub', async () => {
    const pl = await import('../auth/pinLogin')
    expect(defaultJoinPort).toBe(pl.joinPort)
  })

  it('one name on the link: "Is this you?" shows just that name', async () => {
    h.names.mockResolvedValue({ kind: 'ok', names: [NAMES[0]!] })
    render(<JoinFlow invite="abcd1234efgh" port={okPort} onBack={() => undefined} />)
    const list = await screen.findByLabelText('Who are you?')
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Is this you?' })).toBeTruthy()
  })

  it.each([
    ['used', /already used, or a newer link replaced it/],
    ['ended', /ended\. Links work for 7 days/],
    ['tries', /Too many tries on this link/],
    ['bad', /invite link is not working/]
  ] as const)('a refused link (%s) says why and offers no Try again', async (why, text) => {
    h.names.mockResolvedValue({ kind: 'invite', why })
    render(<JoinFlow invite="abcd1234efgh" port={okPort} onBack={() => undefined} />)
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/—/) // no em dash in user copy
  })

  it.each([
    ['bad_pin', /not all the same digit/],
    ['too_many', /Wait an hour/],
    ['no_signal', /No signal/],
    ['bad_invite', /not working/]
  ] as const)('a refused claim (%s) shows its own line and signs nobody in', async (why, text) => {
    const signIn = vi.fn(async () => null as string | null)
    render(<JoinFlow invite="abcd1234efgh" port={async () => ({ ok: false, why })} signIn={signIn} onBack={() => undefined} />)
    fireEvent.click(within(await screen.findByLabelText('Who are you?')).getByRole('button', { name: /Mama/ }))
    enter('135790'); enter('135790')
    expect((await screen.findByRole('alert')).textContent).toMatch(text)
    expect(signIn).not.toHaveBeenCalled()
  })

  it('a bad invite (server error) says so and offers Try again; offline says No signal', async () => {
    h.names.mockResolvedValue({ kind: 'error' })
    render(<JoinFlow invite="abcd1234efgh" port={okPort} onBack={() => undefined} />)
    expect(await screen.findByText(/invite link is not working/)).toBeTruthy()
    cleanup()
    h.names.mockResolvedValue({ kind: 'offline' })
    render(<JoinFlow invite="abcd1234efgh" port={okPort} onBack={() => undefined} />)
    expect(await screen.findByText('No signal. Try again when you have data.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
