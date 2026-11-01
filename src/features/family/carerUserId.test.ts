import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { SELF_USER } from '../sync/profile'
import { carerUserId, loadCarerOf } from './reportData'

const member = vi.hoisted(() => ({ value: null as { userId: string } | null }))
vi.mock('../auth/session', () => ({ getMember: async () => member.value }))

beforeEach(async () => { await db.kv.clear(); member.value = null })

describe('carerUserId (offline, expired token)', () => {
  it('uses the signed-in member when there is one', async () => {
    member.value = { userId: 'u1' }
    expect(await carerUserId()).toBe('u1')
  })
  it('falls back to the user this phone last saw, so the carers cache is still read', async () => {
    await db.kv.put({ key: SELF_USER, value: 'u1' })
    await db.kv.put({ key: 'carers.all', value: { userId: 'u1', ids: ['p2'] } })
    const u = await carerUserId()
    expect(u).toBe('u1')
    expect(await loadCarerOf(null, u!)).toEqual(['p2'])
  })
  it('fails closed when no user is known', async () => {
    await db.kv.put({ key: 'carers.all', value: { userId: 'u1', ids: ['p2'] } })
    expect(await carerUserId()).toBeNull()
  })
})
