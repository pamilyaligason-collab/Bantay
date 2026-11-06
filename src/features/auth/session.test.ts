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
    from: (t: string) => ({ select: (cols: string) => ({ eq: () => ({ maybeSingle: async () => (cols === 'is_owner' && state.rows.ownerError ? { data: null, error: state.rows.ownerError } : { data: state.rows[t] ?? null, error: null }) }) }) })
  }
}))

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
})
