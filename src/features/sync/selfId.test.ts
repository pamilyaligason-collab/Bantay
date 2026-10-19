import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const auth = vi.hoisted(() => ({ member: null as null | { userId: string; personId: string | null; role: 'member'; handle: null } }))
vi.mock('../auth/session', () => ({ getMember: async () => auth.member }))
import { SELF_ID, SELF_USER, forgetSelf, selfIdOrCached } from './profile'

const member = (userId: string, personId: string | null) => ({ userId, personId, role: 'member' as const, handle: null })
beforeEach(async () => { await db.kv.clear(); auth.member = null })

describe('selfIdOrCached', () => {
  it('no member (signed out) -> null, even with an id cached', async () => {
    await db.kv.bulkPut([{ key: SELF_ID, value: 'old' }, { key: SELF_USER, value: 'u1' }])
    expect(await selfIdOrCached()).toBeNull()
  })
  it('member with a person -> that id, and remembers which user it belongs to', async () => {
    auth.member = member('u1', 'p1')
    expect(await selfIdOrCached()).toBe('p1')
    expect((await db.kv.get(SELF_USER))?.value).toBe('u1')
  })
  it('member offline (no person fetched) with a cache for the same user -> cached id', async () => {
    await db.kv.bulkPut([{ key: SELF_ID, value: 'p1' }, { key: SELF_USER, value: 'u1' }])
    auth.member = member('u1', null)
    expect(await selfIdOrCached()).toBe('p1')
  })
  it('cache stored for a different user -> null', async () => {
    await db.kv.bulkPut([{ key: SELF_ID, value: 'p1' }, { key: SELF_USER, value: 'u1' }])
    auth.member = member('u2', null)
    expect(await selfIdOrCached()).toBeNull()
  })
  it('after sign-out forgets the cache -> null for the next member too', async () => {
    await db.kv.bulkPut([{ key: SELF_ID, value: 'p1' }, { key: SELF_USER, value: 'u1' }])
    await forgetSelf()
    auth.member = member('u1', null)
    expect(await selfIdOrCached()).toBeNull()
  })
})
