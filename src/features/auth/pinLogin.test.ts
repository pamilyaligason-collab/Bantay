import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ supabase: {}, supabaseUrl: 'https://x.test', supabasePublishableKey: 'sb_publishable_test' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/browser', () => ({ Browser: {} }))
import { WAIT_MS, fetchFamilyNames, inviteFromHash, wrongState } from './pinLogin'

afterEach(() => vi.unstubAllGlobals())
const reply = (ok: boolean, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))

describe('fetchFamilyNames', () => {
  it('keeps only well-formed entries', async () => {
    reply(true, [{ first_name: 'Lola', initial: 'R', handle: 'lola', id: 'secret' }, { first_name: '', handle: 'ben' }, { first_name: 'X', handle: 'Bad Handle' }, null])
    expect(await fetchFamilyNames()).toEqual({ kind: 'ok', names: [{ first_name: 'Lola', initial: 'R', handle: 'lola' }] })
  })
  it('a server error or odd body is an error, not a name list', async () => {
    reply(false, [])
    expect(await fetchFamilyNames()).toEqual({ kind: 'error' })
    reply(true, { ok: false })
    expect(await fetchFamilyNames()).toEqual({ kind: 'error' })
  })
  it('a network failure is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await fetchFamilyNames()).toEqual({ kind: 'offline' })
  })
})

describe('fetchFamilyNames invite mode (M6)', () => {
  it('adds ?invite=<token> only for a well-formed token', async () => {
    reply(true, [])
    await fetchFamilyNames('abcd1234efgh')
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe('https://x.test/functions/v1/family-names?invite=abcd1234efgh')
    await fetchFamilyNames('bad token&x=1')
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toBe('https://x.test/functions/v1/family-names')
  })
})

describe('inviteFromHash', () => {
  it('reads #join/<token>', () => {
    expect(inviteFromHash('#join/abcd1234efgh')).toBe('abcd1234efgh')
    expect(inviteFromHash('#join/abc')).toBeNull() // too short
    expect(inviteFromHash('#me')).toBeNull()
    expect(inviteFromHash('')).toBeNull()
  })
})

describe('wrongState (one-minute wait after five misses)', () => {
  const now = 1_000_000
  it('no misses: five tries', () => expect(wrongState(undefined, now)).toEqual({ kind: 'tries', left: 5 }))
  it('4 misses: one try left', () => expect(wrongState({ n: 4, lastAt: now - 1000 }, now)).toEqual({ kind: 'tries', left: 1 }))
  it('5 misses: waits until lastAt + 60 s', () => expect(wrongState({ n: 5, lastAt: now - 12_000 }, now)).toEqual({ kind: 'wait', until: now - 12_000 + WAIT_MS }))
  it('after the minute: one try, and the count is kept', () => expect(wrongState({ n: 5, lastAt: now - 61_000 }, now)).toEqual({ kind: 'tries', left: 1 }))
})
