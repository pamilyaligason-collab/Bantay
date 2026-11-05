import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashMessage, installErrorLogging, normalizeMessage, ownFrame, reportError, whereOf } from './errors'

const st = vi.hoisted(() => ({ configured: true, token: 'tok' as string | null, rpc: vi.fn() }))
vi.mock('../auth/client', () => ({ get supabase() { return st.configured ? { rpc: st.rpc } : null } }))
const shell = vi.hoisted(() => ({ v: null as string | null }))
vi.mock('../phonecheck/appInfo', () => ({ shellVersionNow: async () => shell.v }))
vi.mock('../auth/session', () => ({ getAccessToken: async () => st.token }))

beforeEach(() => {
  st.configured = true; st.token = 'tok'; shell.v = null
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
    expect(hashes.map((h) => h.p_where)).toEqual(['window.onerror:typeerror', 'unhandledrejection:rangeerror'])
    expect(hashes[0]!.p_hash).toBe(hashMessage(normalizeMessage('TypeError: bad thing 5')))
    expect(JSON.stringify(st.rpc.mock.calls)).not.toMatch(/pages\.dev|\.js:/)
    const off = vi.spyOn(window, 'removeEventListener')
    stop()
    expect(off.mock.calls.map((c) => c[0]).sort()).toEqual(['error', 'unhandledrejection'])
    off.mockRestore()
  })
})

describe('where: class name and own-bundle frame only (B-7)', () => {
  const origin = 'http://localhost:3000'
  const err = (name: string, stack: string) => Object.assign(new Error('secret reading 150/90 for Mama'), { name, stack })
  it('takes the top frame from our own origin, drops path and query, lower-cases', () => {
    const stack = `TypeError: x
    at chrome-extension://abc/inject.js:1:2
    at f (${origin}/assets/Index-AbC123.js?v=Mama&bp=150:12:3456)
    at g (${origin}/assets/other.js:1:1)`
    expect(ownFrame(stack, origin)).toBe('index-abc123.js:12:3456')
    expect(ownFrame('at https://evil.example/assets/a.js:1:1', origin)).toBeNull()
    expect(ownFrame(undefined, origin)).toBeNull()
  })
  it('whereOf adds the class name and frame, never the message, and passes the server check', () => {
    const w = whereOf('unhandledrejection', err('TypeError', `at f (${location.origin}/assets/index-q1.js:1:99)`))
    expect(w).toBe('unhandledrejection:typeerror:index-q1.js:1:99')
    expect(w).toMatch(/^[a-z0-9_.:/-]{1,64}$/)
    expect(w).not.toMatch(/mama|150|secret/)
  })
  it('falls back to the plain place for a non-Error, an odd class name, and never exceeds 64 characters', () => {
    expect(whereOf('unhandledrejection', 'a string')).toBe('unhandledrejection')
    expect(whereOf('window.onerror', err('Bad Name 150', ''))).toBe('window.onerror:other') // a custom name is never sent
    const long = whereOf('unhandledrejection', err('AVeryLongErrorClassNameXX', `at f (${location.origin}/assets/${'a'.repeat(30)}.js:123456:123456)`))
    expect(long.length).toBeLessThanOrEqual(64)
  })
  it('a message holding our own origin, a name or a value cannot reach where_', () => {
    const e = Object.assign(new Error(`Mama BP 150/90 at ${location.origin}/assets/leak.js:9:9`), { name: 'Mama150Error' })
    e.stack = `Mama150Error: ${e.message}
    at f (${location.origin}/assets/index-ok.js:2:3)`
    const w = whereOf('unhandledrejection', e)
    expect(w).toBe('unhandledrejection:other:index-ok.js:2:3')
    e.stack = `Error: ${e.message}` // no frame at all: the message line is never scanned
    expect(whereOf('unhandledrejection', Object.assign(e, { name: 'Error' }))).toBe('unhandledrejection:error')
  })
  it('on a phone the app_version sent is the shell version, else the web build label', async () => {
    shell.v = '2.4.0'
    expect(await reportError('window.onerror', 'one')).toBe(true)
    expect((st.rpc.mock.calls[0] as [string, Record<string, string>])[1].p_app_version).toBe('2.4.0')
    shell.v = null
    expect(await reportError('window.onerror', 'two')).toBe(true)
    expect((st.rpc.mock.calls[1] as [string, Record<string, string>])[1].p_app_version).toBe('dev')
  })
  it('reportError sends the richer place', async () => {
    expect(await reportError('unhandledrejection', 'boom', err('RangeError', `at f (${location.origin}/assets/index-z.js:1:5)`))).toBe(true)
    expect((st.rpc.mock.calls[0] as [string, Record<string, string>])[1].p_where).toBe('unhandledrejection:rangeerror:index-z.js:1:5')
  })
})
