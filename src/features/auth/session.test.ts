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
    from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.rows[t] ?? null }) }) }) })
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
    expect(await getMember()).toEqual({ userId: 'u1', personId: null, role: 'member', handle: null })
  })
  it('reads role, handle and person id', async () => {
    state.session = { access_token: 't', user: { id: 'u1' } }
    state.rows.app_roles = { role: 'admin', handle: 'ate' }
    state.rows.people = { id: 'p1' }
    expect(await getMember()).toEqual({ userId: 'u1', personId: 'p1', role: 'admin', handle: 'ate' })
  })
  it('onAuthChange calls back and unsubscribes; signOut signs out', async () => {
    const cb = vi.fn()
    onAuthChange(cb)()
    expect(cb).toHaveBeenCalled()
    expect(state.rows.unsub).toBe(true)
    await signOut()
    expect(state.rows.out).toBe(true)
  })
  it('signOut wipes the Ask history so the next person on a shared phone cannot read it', async () => {
    await db.kv.put({ key: 'assistant.history', value: [{ role: 'user', content: 'my blood pressure' }] })
    await signOut()
    expect(await db.kv.get('assistant.history')).toBeUndefined()
  })
})
