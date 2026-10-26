import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashMessage, installErrorLogging, normalizeMessage, reportError } from './errors'

const st = vi.hoisted(() => ({ configured: true, token: 'tok' as string | null, rpc: vi.fn() }))
vi.mock('../auth/client', () => ({ get supabase() { return st.configured ? { rpc: st.rpc } : null } }))
vi.mock('../auth/session', () => ({ getAccessToken: async () => st.token }))

beforeEach(() => {
  st.configured = true; st.token = 'tok'
  st.rpc.mockReset(); st.rpc.mockResolvedValue({ error: null })
  localStorage.clear()
})

describe('normalise and hash', () => {
  it('lower-cases, turns digits into #, squeezes spaces, cuts at 200', () => {
    expect(normalizeMessage('TypeError:  Cannot read  x of Mama BP 150/90')).toBe('typeerror: cannot read x of mama bp #/#')
    expect(normalizeMessage('a'.repeat(300))).toHaveLength(200)
  })
  it('the same error with another number hashes the same; different errors differ', () => {
    expect(hashMessage(normalizeMessage('failed at row 12'))).toBe(hashMessage(normalizeMessage('failed at row 987')))
    expect(hashMessage('abc')).not.toBe(hashMessage('abd'))
  })
  it('a hash is 16 lower-case hex characters, so it passes the server check', () => {
    expect(hashMessage('anything at all')).toMatch(/^[0-9a-f]{16}$/)
    expect(hashMessage('')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('reportError', () => {
  it('sends only place, hash and version: no message text, no digits from the message', async () => {
    expect(await reportError('window.onerror', 'TypeError: reading 150/90 for Mama')).toBe(true)
    expect(st.rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = st.rpc.mock.calls[0] as [string, Record<string, string>]
    expect(fn).toBe('log_client_error')
    expect(Object.keys(args).sort()).toEqual(['p_app_version', 'p_hash', 'p_where'])
    expect(args.p_where).toBe('window.onerror')
    expect(args.p_hash).toMatch(/^[0-9a-f]{16}$/)
    expect(JSON.stringify(args)).not.toMatch(/mama|150|typeerror/i)
  })

  it('sends one error once per day: the second identical error is skipped, a different one goes', async () => {
    expect(await reportError('window.onerror', 'boom 1')).toBe(true)
    expect(await reportError('window.onerror', 'boom 2')).toBe(false) // same after digits are normalised
    expect(await reportError('unhandledrejection', 'boom 1')).toBe(true) // other place = other row
    expect(await reportError('window.onerror', 'other thing')).toBe(true)
    expect(st.rpc).toHaveBeenCalledTimes(3)
  })

  it('sends again the next day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-26T04:00:00Z'))
    expect(await reportError('window.onerror', 'boom')).toBe(true)
    vi.setSystemTime(new Date('2026-10-26T15:00:00Z')) // 23:00 Manila, same day
    expect(await reportError('window.onerror', 'boom')).toBe(false)
    vi.setSystemTime(new Date('2026-10-26T16:30:00Z')) // 00:30 Manila, next day
    expect(await reportError('window.onerror', 'boom')).toBe(true)
    vi.useRealTimers()
  })

  it('stops at 50 different errors a day (the server cap)', async () => {
    for (let i = 0; i < 55; i++) await reportError('window.onerror', `distinct message ${'x'.repeat(i)}`)
    expect(st.rpc).toHaveBeenCalledTimes(50)
  })

  it('is silent when signed out or not configured, and does not mark the error as sent', async () => {
    st.token = null
    expect(await reportError('window.onerror', 'boom')).toBe(false)
    st.configured = false; st.token = 'tok'
    expect(await reportError('window.onerror', 'boom')).toBe(false)
    expect(st.rpc).not.toHaveBeenCalled()
    st.configured = true
    expect(await reportError('window.onerror', 'boom')).toBe(true) // later, signed in: still sent
  })

  it('a failed call is not marked as sent, so the next occurrence retries; it never throws', async () => {
    st.rpc.mockResolvedValueOnce({ error: { message: 'offline' } })
    expect(await reportError('window.onerror', 'boom')).toBe(false)
    expect(await reportError('window.onerror', 'boom')).toBe(true)
    st.rpc.mockRejectedValueOnce(new Error('network'))
    await expect(reportError('window.onerror', 'other')).resolves.toBe(false)
  })

  it('skips browser noise and empty messages', async () => {
    for (const m of ['Script error.', 'ResizeObserver loop completed with undelivered notifications.', '', '   ']) expect(await reportError('window.onerror', m)).toBe(false)
    expect(st.rpc).not.toHaveBeenCalled()
  })

  it('two at once for the same error send one row', async () => {
    const [a, b] = await Promise.all([reportError('window.onerror', 'same'), reportError('window.onerror', 'same')])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(st.rpc).toHaveBeenCalledTimes(1)
  })
})

describe('installErrorLogging', () => {
  it('hooks window error and unhandledrejection, uses name and message (no stack), and the stop function removes both', async () => {
    const stop = installErrorLogging()
    const err = new TypeError('bad thing 5'); err.stack = 'at https://bantay.pages.dev/assets/x.js:1:1'
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: 'ignored when error is set' }))
    const rej = new Event('unhandledrejection') as Event & { reason?: unknown }
    rej.reason = new RangeError('too far')
    window.dispatchEvent(rej)
    await vi.waitFor(() => expect(st.rpc).toHaveBeenCalledTimes(2))
    const hashes = st.rpc.mock.calls.map((c) => (c[1] as { p_hash: string; p_where: string }))
    expect(hashes.map((h) => h.p_where)).toEqual(['window.onerror', 'unhandledrejection'])
    expect(hashes[0]!.p_hash).toBe(hashMessage(normalizeMessage('TypeError: bad thing 5')))
    expect(JSON.stringify(st.rpc.mock.calls)).not.toMatch(/pages\.dev|\.js:/)
    const off = vi.spyOn(window, 'removeEventListener')
    stop()
    expect(off.mock.calls.map((c) => c[0]).sort()).toEqual(['error', 'unhandledrejection'])
    off.mockRestore()
  })
})
