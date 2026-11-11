import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

// S30 L8 r2 (privacy): the phone's time zone goes to the server only while this person's place sharing is on (and the notice was answered). Off: nothing is sent and nothing is cleared.
const h = vi.hoisted(() => ({ rpc: vi.fn(() => Promise.resolve({ error: null })), me: 'p-me' as string | null }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => (h.rpc as (...x: unknown[]) => unknown)(...a) } }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: () => Promise.resolve(h.me) }))
import { reportMyZone, TZ_SENT_KEY } from './reportZone'

const NOW = Date.parse('2026-12-01T14:00:00Z')
beforeEach(async () => {
  await db.kv.clear(); h.rpc.mockClear(); h.me = 'p-me'
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/Chicago' } as Intl.ResolvedDateTimeFormatOptions)
  localStorage.removeItem('bantay.flag.places')
})
afterEach(() => vi.restoreAllMocks())
const answered = () => db.kv.put({ key: 'place.notice.seen:p-me', value: true })

describe('reportMyZone follows the place-sharing switch', () => {
  it('sharing on (the default) and the notice answered: the Chicago zone is sent once', async () => {
    await answered()
    expect(await reportMyZone('u1', NOW)).toBe(true)
    expect(h.rpc).toHaveBeenCalledWith('set_my_tz', { p_tz: 'America/Chicago' })
  })
  it('sharing switched off: nothing is sent and nothing is written to the sent record', async () => {
    await answered()
    await db.kv.put({ key: 'place.sharing:p-me', value: false })
    expect(await reportMyZone('u1', NOW)).toBe(false)
    expect(h.rpc).not.toHaveBeenCalled()
    expect(await db.kv.get(TZ_SENT_KEY)).toBeUndefined()
  })
  it('the place notice not answered yet: nothing is sent (ML-46)', async () => {
    expect(await reportMyZone('u1', NOW)).toBe(false)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('another person on the same phone has not answered: nothing is sent for them', async () => {
    await answered() // p-me answered
    h.me = 'p-other'
    expect(await reportMyZone('u2', NOW)).toBe(false)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('person unknown (signed out, offline with no cached id): nothing is sent', async () => {
    h.me = null
    expect(await reportMyZone('u1', NOW)).toBe(false)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('the places flag off for the whole build: nothing is sent', async () => {
    await answered()
    localStorage.setItem('bantay.flag.places', '0')
    expect(await reportMyZone('u1', NOW)).toBe(false)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
