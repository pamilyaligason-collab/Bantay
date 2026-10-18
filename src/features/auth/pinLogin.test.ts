import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ supabase: {}, supabaseUrl: 'https://x.test', supabasePublishableKey: 'sb_publishable_test' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/browser', () => ({ Browser: {} }))
import { fetchFamilyNames } from './pinLogin'

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
