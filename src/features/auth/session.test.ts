import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: null as null | { access_token: string; user: { id: string } }, rows: {} as Record<string, unknown> }))

vi.mock('./client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb: () => void) => { cb(); return { data: { subscription: { unsubscribe: () => { state.rows.unsub = true } } } } },
      signOut: async () => { state.rows.out = true }
    },
    rpc: async (n: string, a: unknown) => { state.rows.rpc = [...((state.rows.rpc as unknown[]) ?? []), [n, a]]; return { data: null, error: null } },
    from: (t: string) => ({ select: (cols: string) => ({ eq: () => ({ maybeSingle: async () => (cols === 'is_owner' && state.rows.ownerError ? { data: null, error: state.rows.ownerError } : { data: state.rows[t] ?? null, error: null }) }) }) })
  }
}))

// signOut ordering guard: with stubClear set, bgPlaceClear does nothing, so only bgPlaceStash (called BEFORE the place. wipe) can queue the revoke
vi.mock('../family/bgPlace', async (orig) => {
  const real = await orig<typeof import('../family/bgPlace')>()
  return { ...real, bgPlaceClear: (...a: Parameters<typeof real.bgPlaceClear>) => (state.rows.stubClear ? Promise.resolve('off' as const) : real.bgPlaceClear(...a)) }
})

import { db } from '../../db'
import { getAccessToken, getMember, onAuthChange, signOut } from './session'

describe('session', () => {
  beforeEach(() => { state.session = null; state.rows = {} })

  it('signed out: no token, no member', async () => {
    expect(await getAccessToken()).toBeNull()
    expect(await getMember()).toBeNull()
  })
  it('signed in with no role row is a member with no person yet', async () => {
    state.session = { access_token: 't', user: { id: 'u1' } }
    expect(await getAccessToken()).toBe('t')
    expect(await getMember()).toEqual({ userId: 'u1', personId: null, role: 'member', handle: null, isOwner: false })
  })
  it('reads role, handle and person id', async () => {
    state.session = { access_token: 't', user: { id: 'u1' } }
    state.rows.app_roles = { role: 'admin', handle: 'ate' }
    state.rows.people = { id: 'p1' }
    expect(await getMember()).toEqual({ userId: 'u1', personId: 'p1', role: 'admin', handle: 'ate', isOwner: false })
  })
  it('isOwner is true only when the row says so', async () => {
    state.session = { access_token: 't', user: { id: 'u1' } }
    state.rows.app_roles = { role: 'admin', handle: null, is_owner: true }
    expect((await getMember())?.isOwner).toBe(true)
  })
  it('an error on the owner read (0046 not applied, or offline) keeps the admin an admin and says not owner', async () => {
    state.session = { access_token: 't', user: { id: 'u1' } }
    state.rows.app_roles = { role: 'admin', handle: null, is_owner: true }
    state.rows.ownerError = { code: '42703' }
    expect(await getMember()).toEqual({ userId: 'u1', personId: null, role: 'admin', handle: null, isOwner: false })
  })
  it('onAuthChange calls back and unsubscribes; signOut signs out', async () => {
    const cb = vi.fn()
    onAuthChange(cb)()
    expect(cb).toHaveBeenCalled()
    expect(state.rows.unsub).toBe(true)
    await signOut()
    expect(state.rows.out).toBe(true)
  })
  it('signOut empties the family feed table so the next person on a shared phone cannot read other members\' values', async () => {
    await db.feed.put({ id: 'bp|1', kind: 'bp', personId: 'p2', at: '2026-11-05T00:00:00.000Z', titleKey: '', valueText: '148/90 mmHg', chip: null, photoPath: null, rowId: '1' })
    await signOut()
    expect(await db.feed.count()).toBe(0)
  })
  it('signOut wipes the Ask history so the next person on a shared phone cannot read it', async () => {
    await db.kv.put({ key: 'assistant.history', value: [{ role: 'user', content: 'my blood pressure' }] })
    await signOut()
    expect(await db.kv.get('assistant.history')).toBeUndefined()
  })
  it('signOut clears the place sharing keys of every person, so the next person on the phone starts clean (D-138)', async () => {
    await db.kv.bulkPut([{ key: 'place.notice.seen:p1', value: true }, { key: 'place.sharing:p1', value: false }, { key: 'place.notice.seen:p2', value: true }, { key: 'loc.other', value: 1 }])
    await signOut()
    expect((await db.kv.toCollection().primaryKeys()).filter((k) => String(k).startsWith('place.'))).toEqual([])
    expect(await db.kv.get('loc.other')).toBeDefined()
  })
  it('signOut revokes the background place key of this phone on the server before the wipe (D-150), and leaves none behind', async () => {
    await db.kv.bulkPut([{ key: 'place.bgkey:p1', value: { k: 'bpk_session_test_key_0000000000000001', at: Date.now() } }, { key: 'place.sharing:p1', value: true }])
    await signOut()
    expect(state.rows.rpc).toEqual([['device_place_key_revoke', { p_key: 'bpk_session_test_key_0000000000000001' }]])
    expect(await db.kv.get('place.bgkey:p1')).toBeUndefined()
  })
  it('signOut calls bgPlaceStash before the place. wipe: the held key is queued even when bgPlaceClear does nothing (D-151, ordering)', async () => {
    state.rows.stubClear = true
    await db.kv.bulkPut([{ key: 'place.bgkey:p1', value: { k: 'bpk_session_test_key_0000000000000002', at: Date.now() } }, { key: 'place.sharing:p1', value: true }])
    await signOut()
    expect(await db.kv.toCollection().primaryKeys().then((k) => k.filter((x) => String(x).startsWith('place.')))).toEqual([])
    // the held record is wiped, so the only copy left is the revoke queue that bgPlaceStash filled first
    const queued = (await db.kv.toCollection().toArray()).filter((r) => JSON.stringify(r).includes('bpk_session_test_key_0000000000000002'))
    expect(queued.length).toBeGreaterThan(0)
  })
})
